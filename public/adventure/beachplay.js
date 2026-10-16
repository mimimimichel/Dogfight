/*
 * Matcha & Ainu — La Plage aux Coquillages : tout ce qui bouge et se joue.
 * Creuser dans les tas de sable qui brillent ; le bodyboard (gauche / droite tourne la planche,
 * la caméra suit derrière), la leçon puis la course contre Mistral ; les crabes farceurs et le
 * Roi des Crabes ; le bébé phoque affamé (la glace à la sardine de Gino) ; la carte au trésor de
 * Barnabé en trois morceaux et le coffre de l'Île aux Mouettes ; les trois lentilles du phare de
 * Perle ; le fort de sable des chats (chats et drapeaux) ; le chamboule-tout du village.
 * Le navigateur de l'hôte fait tourner les règles ; les invités reçoivent l'état.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as K from './citykit.js';
import * as N from './npcs.js';
import * as W from './world.js';
import { shellGeometry, paint } from './beach.js';
import { buildLife, skinMaterial } from './life.js';
import * as LIFE from './level6life.js';

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

function buildLens() {
  const g = new THREE.Group();
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshStandardMaterial({ color: 0xbff4ff, emissive: 0x3ac8ff, emissiveIntensity: 0.9, roughness: 0.1, metalness: 0.2, flatShading: true }));
  gem.scale.set(1, 1.35, 1);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0x8ae8ff, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  halo.scale.set(2.4, 2.4, 1); halo.userData.noOutline = true;
  g.add(gem, halo);
  g.userData = { gem };
  return g;
}
function buildScroll() {
  const g = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 10), M.mat(0xf2e2b8, { roughness: 0.8 }));
  paper.rotation.z = Math.PI / 2;
  const ribbon = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.025, 6, 12), M.mat(0xd83a3a)); ribbon.rotation.y = Math.PI / 2;
  g.add(paper, ribbon);
  return g;
}
function buildBottle() {
  const g = new THREE.Group();
  const glass = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.55, 12), new THREE.MeshStandardMaterial({ color: 0x8ad8a0, roughness: 0.1, transparent: true, opacity: 0.7, emissive: 0x1a5a2a, emissiveIntensity: 0.3 }));
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.25, 10), glass.material); neck.position.y = 0.38;
  const cork = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 8), M.mat(0xa87a48)); cork.position.y = 0.53;
  const paper = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 8), M.mat(0xf2e2b8)); paper.position.y = 0.02;
  g.add(glass, neck, cork, paper);
  g.rotation.z = 1.2;
  return g;
}
function buildCanStack() {
  const g = new THREE.Group(), cans = [];
  const cols = [0xe04848, 0x3a8ae0, 0xffd23a, 0x40b060, 0xff7ab0, 0xffffff];
  const pos = [[-0.42, 0.24], [0, 0.24], [0.42, 0.24], [-0.21, 0.72], [0.21, 0.72], [0, 1.2]];
  pos.forEach(([x, y], i) => {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.46, 12), M.mat(cols[i], { metalness: 0.5, roughness: 0.35 }));
    c.position.set(x, y, 0); c.userData.home = [x, y]; g.add(c); cans.push(c);
  });
  g.userData.cans = cans;
  return g;
}
function buildFortFlag(tex) {
  const g = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.7, 6), M.mat(0x6a4a30)); pole.position.y = 0.85;
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 0.6, 6, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
  cloth.geometry.translate(0.5, 0, 0); cloth.position.set(0.05, 1.4, 0);
  g.add(pole, cloth);
  g.userData = { cloth, base: cloth.geometry.attributes.position.array.slice() };
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
    for (const [k, v] of [['dug', []], ['drop', {}], ['cp', 0], ['seal', 'stuck'], ['talk', {}], ['lenses', []], ['pieces', []], ['flags', []]]) if (b[k] === undefined) b[k] = Array.isArray(v) ? [] : (typeof v === 'object' ? {} : v);
    return b;
  };
  const players = () => game.players;
  const distXZ = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const isGuest = () => game.guest;
  const cull = decor.cull;
  const place = (obj, x, z, r, far) => { sc.add(obj); cull.push({ obj, x, z, r: r || 6, far }); return obj; };

  // --- Personnages ---------------------------------------------------------------------
  const G = S.GIVERS;
  const barnabe = K.buildCitizen('sailor');
  barnabe.position.set(G.barnabe.x, G.barnabe.y, G.barnabe.z); barnabe.rotation.y = G.barnabe.yaw;
  place(barnabe, G.barnabe.x, G.barnabe.z, 3); chars.push(barnabe);
  const mistral = buildLifeguard(lite);
  mistral.position.set(G.mistral.x, G.mistral.y, G.mistral.z); mistral.rotation.y = G.mistral.yaw;
  sc.add(mistral); chars.push(mistral); moving.push(mistral);
  const perle = K.buildCitizen('lady');
  perle.position.set(G.perle.x, G.perle.y, G.perle.z); perle.rotation.y = G.perle.yaw;
  place(perle, G.perle.x, G.perle.z, 3); chars.push(perle);
  const gino = K.buildCitizen('baker');
  gino.position.set(G.gino.x, G.gino.y, G.gino.z); gino.rotation.y = G.gino.yaw;
  place(gino, G.gino.x, G.gino.z, 3); chars.push(gino);
  const NPC = { barnabe, mistral, perle, gino };
  const marks = {};
  for (const k of ['barnabe', 'mistral', 'perle', 'gino']) marks[k] = game.makeMark('!', 0xff9a2a);
  marks.seal = game.makeMark('?', 0x8ad0ff);
  const baby = buildSeal(true);
  sc.add(baby); chars.push(baby); moving.push(baby);
  const babyShadow = game.makeShadow(0.6);
  const mama = buildSeal(false);
  mama.position.set(S.SEAL_ROCK.x, S.SEAL_ROCK.top - 0.05, S.SEAL_ROCK.z); mama.rotation.y = 0.6;
  place(mama, S.SEAL_ROCK.x, S.SEAL_ROCK.z, 4); chars.push(mama); moving.push(mama);

  // --- Tas de sable qui brillent, tas du morceau de carte, croix rouge, coffre ---------
  const moundDefs = S.MOUNDS.concat([S.PIECE_MOUND, S.CHEST]);
  const special = (d) => d.id === 'chest' || d.id === 'piece';
  const moundGeo = new THREE.SphereGeometry(0.85, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const mounds = new THREE.InstancedMesh(moundGeo, new THREE.MeshStandardMaterial({ roughness: 1, color: 0xffffff }), moundDefs.length);
  mounds.receiveShadow = true; mounds.castShadow = true; mounds.frustumCulled = false;
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
    place(xMark, S.CHEST.x, S.CHEST.z, 2);
  }
  const chest = buildChest();
  chest.position.set(S.CHEST.x, S.CHEST.y - 1.2, S.CHEST.z); chest.rotation.y = 0.3; chest.visible = false;
  sc.add(chest); moving.push(chest);

  // --- Lentilles du phare, morceaux de carte, drapeaux du fort, chamboule-tout -----------
  const lenses = S.LENSES.map(d => { const m = buildLens(); m.position.set(d.x, d.y, d.z); sc.add(m); moving.push(m); return { def: d, m }; });
  const bottle = buildBottle(); bottle.position.set(S.MAP_PIECES[0].x, S.MAP_PIECES[0].y + 0.35, S.MAP_PIECES[0].z); sc.add(bottle); moving.push(bottle);
  const scroll = buildScroll(); sc.add(scroll); moving.push(scroll);
  const fortFlags = S.FORT_FLAGS.map(d => { const m = buildFortFlag(decor.fort.flagTex); m.position.set(d.x, d.y, d.z); sc.add(m); moving.push(m); return { def: d, m, fall: 0 }; });
  const stacks = S.CAN_STACKS.map(d => { const m = buildCanStack(); m.position.set(d.x, d.y, d.z); sc.add(m); moving.push(m); return { def: d, m, down: false, t: 0 }; });
  const king = buildCrab(); king.scale.setScalar(2.1); king.userData.loot.visible = false;
  const kingScroll = buildScroll(); kingScroll.position.set(0, 0.75, 0.25); king.add(kingScroll);
  king.position.set(S.CRAB_KING.x, S.CRAB_KING.y, S.CRAB_KING.z);
  place(king, S.CRAB_KING.x, S.CRAB_KING.z, 3); chars.push(king); moving.push(king);
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.18, 8, 1, true), M.GOLD()); crown.position.set(0, 0.62, 0.05); king.add(crown);

  // --- Planches, crabes ------------------------------------------------------------------
  const RK = S.RACK;
  const boards = S.BOARDS.map((color, i) => {
    const m = buildBoard(color);
    sc.add(m); moving.push(m);
    const slot = { x: RK.x - 1.5 + i * 0.6, z: RK.z + 0.3, y: RK.y + 0.6 };
    return { i, m, color, slot, driver: -1, park: null, x: 0, y: 0, z: 0, yaw: 0, speed: 0, vy: 0, air: false, boost: 0, cd: 0, spin: 0, beachT: 0, bumpT: 0 };
  });
  const rival = { m: buildBoard(0xffffff), on: false, x: 0, y: 0, z: 0, yaw: 0, speed: 0, next: 0, done: false };
  sc.add(rival.m); moving.push(rival.m); rival.m.visible = false;
  const crabs = S.CRABS.map((d, i) => {
    const m = buildCrab();
    sc.add(m); chars.push(m); moving.push(m);
    return { def: d, m, x: d.x, z: d.z, y: d.y, yaw: i, t: i * 0.7, tx: d.x, tz: d.z, flee: 0, fx: 0, fz: 0, phase: 0, wave: 0 };
  });
  // anneau qui montre la prochaine bouée (leçon, course)
  const ring = new THREE.Mesh(new THREE.TorusGeometry(S.RACE.r * 0.75, 0.18, 8, 40), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.85, fog: false }));
  ring.rotation.x = Math.PI / 2; ring.visible = false; ring.userData.noOutline = true;
  const ringBeam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 26, 16, 1, true), K.beaconMaterial(0xffd23a));
  ringBeam.visible = false; ringBeam.userData.noOutline = true; ringBeam.renderOrder = 3;
  sc.add(ring, ringBeam);
  // un rayon de lumière au-dessus de ce qu'on cherche (quête en cours)
  const hint = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 14, 1, true), K.beaconMaterial(0x8ae8ff));
  hint.visible = false; hint.userData.noOutline = true; hint.renderOrder = 3;
  sc.add(hint);

  // --- État ------------------------------------------------------------------------------
  const st = {
    race: null,                // { kind: 'lesson'|'race', ph: 'ready'|'count'|'go', t, next: {pid: i}, lock: [] }
    seal: { x: S.SEAL.x, y: S.SEAL.y + 0.1, z: S.SEAL.z, yaw: 0.5, owner: -1, swim: 0, phase: 0, state: 'stuck' },
    chestT: -1, lightT: -1, popAt: {}, digSeen: new Set(), btn: null, camSet: false, hints: {}, capPos: new THREE.Vector3(), prizeT: -1, kingFlee: 0,
  };

  // =============================================================================
  // Les coquillages cachés : enterrés (tas), gardés par un crabe, prix du chamboule-tout
  // =============================================================================
  const dug = (id) => beach().dug.includes(id);
  function placeHiddenShells() {
    const b = beach();
    for (const s of S.bones) {
      if (s.mound) { s.x = s.x0; s.z = s.z0; s.y = b.dug.includes(s.mound) ? s.y0 : HIDDEN_Y; }
      else if (s.crab) {
        const d = b.drop[s.crab];
        if (d) { s.x = d[0]; s.z = d[1]; s.y = S.groundY(d[0], d[1]) + 0.9; } else { s.x = s.x0; s.z = s.z0; s.y = HIDDEN_Y; }
      } else if (s.prize) { s.x = s.x0; s.z = s.z0; s.y = b.prize ? s.y0 : HIDDEN_Y; }
    }
  }
  placeHiddenShells();
  const moundDone = (d) => (d.id === 'chest' ? !!beach().chest : d.id === 'piece' ? beach().pieces.includes('p2') : dug(d.id));
  const moundShown = (d) => (d.id === 'chest' ? beach().pieces.length >= 3 : d.id === 'piece' ? !!beach().talk.barnabe : true);
  function refreshMounds() {
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), c = new THREE.Color();
    moundDefs.forEach((d, i) => {
      const done = moundDone(d), hide = !moundShown(d) && !done;
      const k = hide ? 0.001 : 1;
      m4.compose(v.set(d.x, d.y - (done ? 0.05 : 0.12), d.z), q, s.set(k * (done ? 1.15 : 1), k * (done ? 0.12 : 0.55), k * (done ? 1.15 : 1)));
      mounds.setMatrixAt(i, m4);
      mounds.setColorAt(i, c.set(done ? 0xb89060 : 0xf8e4b0));
    });
    mounds.instanceMatrix.needsUpdate = true; if (mounds.instanceColor) mounds.instanceColor.needsUpdate = true;
  }
  refreshMounds();

  // =============================================================================
  // Creuser
  // =============================================================================
  const moundNear = (P) => {
    if (!P.grounded) return null;
    let best = null, bd = S.DIG_R;
    for (const d of moundDefs) {
      if (moundDone(d) || !moundShown(d)) continue;
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
      game.banner('LE TRÉSOR DE BARNABÉ !', 'Un vrai coffre de pirate, sous la croix rouge !', 2600);
      for (const Q of players()) Q.cheerT = 1.2;
      refreshMounds();
      setTimeout(() => { if (!game.disposed) game.updateMedalVisibility(); }, 1100);
      return;
    }
    if (id === 'piece') { gotPiece('p2', d); refreshMounds(); return; }
    if (dug(id)) return;
    beach().dug.push(id); game.persist();
    st.popAt[id] = game.t;
    placeHiddenShells();
    refreshMounds();
    game.sound('chain');
    const left = S.MOUNDS.filter(q => !dug(q.id)).length;
    game.banner('Des coquillages !', left ? `Encore ${left} tas qui brille${left > 1 ? 'nt' : ''} quelque part` : 'Tu as creusé tous les tas de la plage !', 1800);
    game.betise(P, 'crates');
  }
  function stepDig(P, dt) {
    P.digT -= dt;
    P.invuln = Math.max(0, P.invuln - dt); P.cheerT = Math.max(0, P.cheerT - dt); P.barkT = Math.max(0, (P.barkT || 0) - dt);
    P.vel.set(0, 0, 0); P.grounded = true;
    if ((game.t * 30 | 0) !== ((game.t - dt) * 30 | 0)) {
      const bx = -Math.sin(P.yaw), bz = -Math.cos(P.yaw);
      game.spawnParticle(P.pos.x + Math.sin(P.yaw) * 0.6, P.pos.y + 0.25, P.pos.z + Math.cos(P.yaw) * 0.6, bx * (3 + Math.random() * 2) + (Math.random() - 0.5) * 1.5, 3 + Math.random() * 2.5, bz * (3 + Math.random() * 2) + (Math.random() - 0.5) * 1.5, 0xe8cc90, 0.2 + Math.random() * 0.12, 0.7, 12);
    }
    if ((game.t * 4 | 0) !== ((game.t - dt) * 4 | 0)) game.sound('poof');
    if (P.digT <= 0) { P.digT = 0; finishDig(P); }
  }

  // =============================================================================
  // Lentilles du phare et morceaux de carte
  // =============================================================================
  function gotPiece(id, at) {
    const b = beach();
    if (b.pieces.includes(id)) return;
    b.pieces.push(id); game.persist();
    game.sound('reveal');
    game.burst(at.x, (at.y || 0) + 1, at.z, 20, 0xf2e2b8, 4, 0.7);
    const n = b.pieces.length;
    if (n >= 3) {
      refreshMounds();
      game.banner('La carte au trésor est complète !', 'La croix rouge est sur l\'Île aux Mouettes : vas-y en bodyboard !', 3600);
    } else game.banner(`Un morceau de la carte ! (${n}/3)`, b.talk.barnabe ? 'Barnabé sera content…' : 'Une carte au trésor… à qui est-elle ?', 2400);
    game.updateHud();
  }
  function stepPickups() {
    const b = beach();
    for (const P of players()) {
      const py = P.pos.y + 0.8;
      for (const L2 of lenses) {
        const d = L2.def;
        if (b.lenses.includes(d.id) || Math.hypot(P.pos.x - d.x, py - d.y, P.pos.z - d.z) > 1.8) continue;
        b.lenses.push(d.id); game.persist();
        game.sound('lantern'); game.burst(d.x, d.y, d.z, 24, 0x8ae8ff, 4, 0.8);
        const n = b.lenses.length;
        game.banner(`Une lentille du phare ! (${n}/3)`, n >= 3 ? 'Toutes les lentilles ! Vite, au phare, chez Perle !' : b.talk.perle ? 'Perle en a besoin pour rallumer le phare.' : 'Une drôle de pierre qui brille…', 2600);
        game.updateHud();
      }
      // la bouteille dans la cale (seulement quand on sait qu'on cherche la carte)
      const B = S.MAP_PIECES[0];
      if (b.talk.barnabe && !b.pieces.includes('p1') && Math.hypot(P.pos.x - B.x, P.pos.z - B.z) < 1.8 && Math.abs(P.pos.y - B.y) < 1.6) gotPiece('p1', B);
      // le parchemin lâché par le Roi des Crabes
      if (b.kingDrop && !b.pieces.includes('p3') && Math.hypot(P.pos.x - b.kingDrop[0], P.pos.z - b.kingDrop[1]) < 1.8) gotPiece('p3', { x: b.kingDrop[0], y: S.groundY(b.kingDrop[0], b.kingDrop[1]), z: b.kingDrop[1] });
    }
  }

  // =============================================================================
  // Le fort de sable : chats et drapeaux ; le chamboule-tout
  // =============================================================================
  function stepFort() {
    const b = beach();
    for (const c of game.cats) {
      if (c.dead || c.def.group !== 'clearing' || !(c.flee > 0)) continue;
      if (Math.hypot(c.pos.x - S.FORT.x, c.pos.z - S.FORT.z) > S.FORT.r + 0.6) game.defeatCat(c);
    }
    for (const f of fortFlags) {
      if (b.flags.includes(f.def.id)) continue;
      const P = players().find(q => (q.attackT > 0 || q.dashT > 0) && Math.hypot(q.pos.x - f.def.x, q.pos.z - f.def.z) < 2.3 && Math.abs(q.pos.y - f.def.y) < 1.8);
      if (!P) continue;
      b.flags.push(f.def.id); game.persist();
      game.sound('crate'); game.burst(f.def.x, f.def.y + 1.2, f.def.z, 16, 0x2a2a3a, 3.5, 0.6);
      const left = S.FORT_FLAGS.length - b.flags.length;
      const catsLeft = S.cats.filter(c => c.group === 'clearing' && !save().cats.includes(c.id)).length;
      game.banner('Un drapeau des chats tombe !', left ? `Encore ${left} drapeau${left > 1 ? 'x' : ''} sur les tours` : catsLeft ? `Tous les drapeaux ! Il reste ${catsLeft} chat${catsLeft > 1 ? 's' : ''} dans le fort` : 'Le fort est libéré !', 2000);
      if (!left && !catsLeft) { game.updateMedalVisibility(); game.sound('reveal'); }
    }
  }
  function stepCans(dt) {
    const b = beach();
    for (const s of stacks) {
      if (s.down) { s.t += dt; if (s.t > 7 && stacks.every(q => q.down)) { for (const q of stacks) { q.down = false; q.t = 0; } } continue; }
      const P = players().find(q => (q.attackT > 0 || q.dashT > 0 || (q.trickT || 0) > 0) && Math.hypot(q.pos.x - s.def.x, q.pos.z - s.def.z) < 2.4 && Math.abs(q.pos.y + 0.8 - s.def.y) < 2);
      if (!P) continue;
      s.down = true; s.t = 0;
      game.sound('crate'); game.burst(s.def.x, s.def.y + 0.6, s.def.z, 14, 0xffd23a, 3.5, 0.5);
      if (stacks.every(q => q.down)) {
        if (!b.prize) {
          b.prize = true; game.persist(); placeHiddenShells();
          st.prizeT = game.t;
          game.sound('win');
          game.banner('CHAMBOULE-TOUT !', 'Tout est tombé ! Gino t\'offre 5 coquillages.', 2600);
        } else game.banner('Encore bravo !', 'Le chamboule-tout se remet en place…', 1600);
      }
    }
  }

  // =============================================================================
  // Bodyboard : gauche / droite tourne la planche (comme une voiture), la caméra suit derrière
  // =============================================================================
  const freeBoard = () => boards.find(b => b.driver < 0 && !b.park) || boards.find(b => b.driver < 0);
  const surfY = (x, z) => S.WATER_Y + 0.1 + S.swell(x, z, game.t);
  const deep = (x, z) => S.heightAt(x, z) < S.WATER_Y - 0.15;
  /** Un point d'eau assez profonde près de (x, z) (pour mettre une planche à l'eau). */
  function deepNear(x, z) {
    if (deep(x, z)) return { x, z };
    for (const r of [1.5, 3, 4.5, 6, 8, 10]) for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (deep(px, pz)) return { x: px, z: pz }; }
    return null;
  }
  function mountBoard(P, b) {
    if (!b || b.driver >= 0 || P.board || P.digT > 0) return;
    let at = null, yaw = S.LAUNCH.yaw;
    if (b.park && distXZ(P.pos, b.park.x, b.park.z) < 6) { at = deepNear(b.park.x, b.park.z); yaw = b.park.yaw; }
    if (!at) { const k = b.i; at = { x: S.LAUNCH.x + (k % 3 - 1) * 2.4, z: S.LAUNCH.z - Math.floor(k / 3) * 2.4 }; yaw = S.LAUNCH.yaw; }
    b.driver = P.id; P.board = b; b.park = null;
    b.x = at.x; b.z = at.z; b.yaw = yaw; b.speed = 0; b.vy = 0; b.air = false; b.boost = 0; b.cd = 0;
    b.y = surfY(b.x, b.z);
    P.attackT = 0; P.dashT = 0; P.vel.set(0, 0, 0); P.pos.set(b.x, b.y, b.z); P.yaw = b.yaw;
    game.burst(b.x, b.y + 0.3, b.z, 16, 0xdff8ff, 4, 0.6);
    game.sound('splash');
    if (P === game.me) { game.camYaw = b.yaw + Math.PI; game.camInit = false; }
    if (!beach().boardTip) {
      beach().boardTip = 1;
      const c = game.controlsHelp();
      game.banner('En bodyboard !', `Gauche / droite : la planche tourne · avant : on avance · ${c.dash} : vague turbo`, 4400);
    }
  }
  function unmountBoard(P, where) {
    const b = P.board;
    if (!b) return;
    b.driver = -1; P.board = null; b.speed = 0;
    // arrivée sur une plage : la planche reste là, au bord de l'eau ; sinon elle retourne au poste
    b.park = where ? { x: b.x, z: b.z, yaw: b.yaw + Math.PI } : null;
    const p = where || { x: RK.x + 1.5, z: RK.z + 1.5 };
    P.pos.set(p.x, S.groundY(p.x, p.z) + 0.05, p.z);
    P.vel.set(0, 3, 0); P.grounded = false; P.jumps = 1; P.invuln = Math.max(P.invuln, 0.5);
    if (P.mesh) { P.mesh.rotation.x = 0; P.mesh.rotation.z = 0; }
    if (st.race && st.race.ph !== 'ready' && st.race.lock && st.race.lock.includes(P.id) && !players().some(Q => Q.board && st.race.lock.includes(Q.id))) {
      const lesson = st.race.kind === 'lesson';
      st.race = null; rival.on = false;
      game.banner(lesson ? 'Leçon interrompue' : 'Course annulée', 'Retournez voir Mistral quand vous voulez !', 2000);
    }
  }
  function landingSpot(b) {
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    for (let d = 1; d < 8; d += 0.5) { const x = b.x + fx * d, z = b.z + fz * d; const h = S.heightAt(x, z); if (h > 0.08 && h < 3.5 && !S.near(x, z, 0.6).some(c => (c.kind === 'rock' || c.solid) && S.inside(c, x, z, 0.5) && c.y1 > h + 0.5)) return { x, z }; }
    return null;
  }
  /** Le joystick vu depuis la planche : [droite, avant] (la caméra est derrière la planche). */
  function boardStick(P, b, wx, wz) {
    const cy = P === game.player && !isGuest() ? game.camYaw : b.yaw + Math.PI;
    const fx = -Math.sin(cy), fz = -Math.cos(cy), rx = Math.cos(cy), rz = -Math.sin(cy);
    return [wx * rx + wz * rz, wx * fx + wz * fz];
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
    let [steer, fwd] = boardStick(P, b, wx, wz);
    // Promenade : pilotage assisté pendant la leçon et la course (cap sur la prochaine bouée) — on reprend la main en tournant
    if (game.easy && !frozen && st.race && st.race.ph === 'go' && st.race.next[P.id] !== undefined && Math.abs(steer) < 0.15) {
      const t = course()[st.race.next[P.id]];
      if (t) {
        const dyaw = ((Math.atan2(t.x - b.x, t.z - b.z) - b.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        steer = clamp(-dyaw * 1.6, -0.9, 0.9);
        if (fwd < 0.15) fwd = 0.9;
      }
    }
    // avant : on accélère ; arrière : on freine ; seulement tourner : on avance doucement
    let target = 0;
    if (fwd > 0.15) target = BB.MAX * Math.min(1, fwd + Math.abs(steer) * 0.4);
    else if (fwd < -0.3) target = 0;
    else if (Math.abs(steer) > 0.25) target = 5.5;
    if (b.boost > 0) target = BB.BOOST;
    const acc = b.boost > 0 ? 30 : target > b.speed ? BB.ACC : fwd < -0.3 ? 16 : BB.COAST;
    b.speed += clamp(target - b.speed, -acc * dt, acc * dt);
    // virage : franc à petite vitesse, un peu plus large à fond
    const turn = clamp(steer, -1, 1) * BB.TURN * (b.speed < 2 ? 0.8 : 1.15 - Math.min(0.35, b.speed / 40));
    b.yaw -= turn * dt;
    // ne pas partir au large : on fait demi-tour tout seul
    if (Math.abs(b.x) > 186 || b.z < -186) b.yaw = lerpAngle(b.yaw, Math.atan2(-b.x, -60 - b.z), Math.min(1, dt * 2));
    const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const next = { x: b.x + fx * b.speed * dt, z: b.z + fz * b.speed * dt };
    game.pushOut(next, b.y - 0.2, BB.R);
    if (!deep(next.x, next.z)) {
      const h = S.heightAt(next.x, next.z);
      // sur le sable : on descend de la planche (si on y va franchement), sinon on s'arrête
      if (h < 3.5 && fwd > 0.3) {
        b.beachT += dt;
        if (b.beachT > 0.25) { const spot = landingSpot(b); b.beachT = 0; if (spot) { unmountBoard(P, spot); game.banner('Sur le sable !', 'Ta planche t\'attend au bord de l\'eau.', 1600); return; } }
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
      const ahead = S.swell(b.x + fx, b.z + fz, game.t);
      if (b.speed > 10 && ahead - (sy - S.WATER_Y - 0.1) > 0.12) { b.vy = 3.5; b.air = true; }
      b.y = sy;
    }
    P.pos.set(b.x, b.y, b.z);
    P.vel.set(fx * b.speed, b.air ? b.vy : 0, fz * b.speed);
    P.yaw = b.yaw; P.grounded = false; P.gliding = false; P.attackT = 0; P.dashT = 0; P.coyote = 0; P.jumps = 2;
  }
  function stepFreeBoards() {
    for (const b of boards) if (b.driver >= 0 && !game.party.has(b.driver)) { b.driver = -1; b.park = null; }
  }

  // =============================================================================
  // La leçon de bodyboard, puis la course contre Mistral
  // =============================================================================
  const RC = S.RACE;
  const course = () => (st.race && st.race.kind === 'lesson' ? S.LESSON : RC.buoys);
  const startPt = () => (st.race && st.race.kind === 'lesson' ? S.LESSON[0] : RC.start);
  const rivalSpeed = () => (game.easy ? 7.6 : game.mode === 'defi' ? 11.6 : 9.2);
  function raceReady(kind) {
    st.race = { kind, ph: 'ready', t: 0, next: {}, lock: [] };
    rival.on = kind === 'race'; rival.done = false; rival.next = 0;
    rival.x = RC.start.x - 2.5; rival.z = RC.start.z - 1; rival.yaw = Math.PI * 1.1; rival.speed = 0; rival.y = surfY(rival.x, rival.z);
    game.updateHud();
  }
  function stepRace(dt) {
    const R = st.race;
    if (!R) { rival.on = false; return; }
    R.t += dt;
    const riders = players().filter(p => p.board);
    const lesson = R.kind === 'lesson';
    if (R.ph === 'ready') {
      const sp = lesson ? RC.start : RC.start;
      if (riders.some(p => distXZ(p.pos, sp.x, sp.z) < RC.r + 2)) {
        R.ph = lesson ? 'go' : 'count'; R.t = 0; R.lock = riders.map(p => p.id); R.next = {};
        for (const p of riders) { R.next[p.id] = 0; if (!lesson) p.board.speed = 0; }
        if (lesson) game.banner('La leçon commence !', 'Passe dans les 3 bouées vertes, dans l\'ordre', 2400);
        else { game.banner('Prêts ?', 'Fais le tour des bouées jaunes, et reviens au poste !', 1800); game.sound('switch'); }
      }
      return;
    }
    if (R.ph === 'count') {
      const n = 3 - Math.floor(R.t);
      if (n !== R.shown && n > 0) { R.shown = n; game.banner(String(n), '', 800); game.sound('cp'); }
      if (R.t >= 3) { R.ph = 'go'; R.t = 0; game.banner('PARTEZ !', '', 900); game.sound('boost'); }
      return;
    }
    const list = course();
    for (const p of players()) {
      if (!p.board || R.next[p.id] === undefined) continue;
      const i = R.next[p.id], bu = list[i];
      if (distXZ(p.pos, bu.x, bu.z) < RC.r) {
        R.next[p.id] = i + 1;
        if (i + 1 >= list.length) { if (lesson) endLesson(p); else winRace(p); return; }
        game.sound('cp');
        game.burst(bu.x, S.WATER_Y + 1, bu.z, 14, lesson ? 0x5ad85a : 0xffd23a, 4, 0.5);
        if (lesson) game.banner(`Bouée ${i + 1}/3 !`, 'Bravo, continue !', 1200);
      }
    }
    if (!lesson) {
      const bu = list[rival.next];
      const dx = bu.x - rival.x, dz = bu.z - rival.z, d = Math.hypot(dx, dz);
      rival.yaw = lerpAngle(rival.yaw, Math.atan2(dx, dz), Math.min(1, dt * 2.5));
      const best = Math.max(...Object.values(R.next));
      const lead = rival.next - best;
      const want = rivalSpeed() * (lead > 0 ? 0.8 : lead < -1 ? 1.12 : lead < 0 ? 1.04 : 1);
      rival.speed += clamp(want - rival.speed, -10 * dt, 6 * dt);
      rival.x += Math.sin(rival.yaw) * rival.speed * dt; rival.z += Math.cos(rival.yaw) * rival.speed * dt;
      rival.y = surfY(rival.x, rival.z);
      if (d < RC.r * 0.6) { rival.next++; if (rival.next >= list.length) loseRace(); }
    }
    if (!players().some(p => p.board && R.next[p.id] !== undefined)) { st.race = null; rival.on = false; }
  }
  function endLesson(P) {
    const b = beach();
    b.lesson = true; game.persist();
    st.race = null;
    game.sound('win');
    for (const Q of players()) Q.cheerT = 1.2;
    game.banner('Leçon réussie !', 'Tu sais piloter ! Retourne voir Mistral pour la grande course.', 3200);
    game.updateHud();
    void P;
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
    game.banner('Mistral a gagné !', 'Presque ! Va voir Mistral pour une revanche.', 3000);
    game.updateHud();
  }

  // =============================================================================
  // Crabes farceurs et Roi des Crabes
  // =============================================================================
  const barkedNow = (P) => (P.barkT || 0) > (P._bk6 === undefined ? 0 : P._bk6) + 0.01;
  function stepCrabs(dt) {
    const b = beach();
    for (const c of crabs) {
      const carry = !b.drop[c.def.id];
      c.t -= dt; c.wave = Math.max(0, c.wave - dt);
      let sp = 0, tx = c.tx, tz = c.tz;
      let near = null, nd = 1e9;
      for (const P of players()) { const d = distXZ(P.pos, c.x, c.z); if (d < nd) { nd = d; near = P; } }
      if (nd > 60) continue;
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
        if (h > S.WATER_Y - 0.25 && h < 3.5 && Math.hypot(nx - c.def.x, nz - c.def.z) < 14) { c.x = nx; c.z = nz; c.y = h; }
        c.phase += dt * sp * 6;
        c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz) + Math.PI / 2, Math.min(1, dt * 6));
      }
      for (const P of players()) {
        if (barkedNow(P) && distXZ(P.pos, c.x, c.z) < 7.5) {
          c.flee = 1.4; c.fx = P.pos.x; c.fz = P.pos.z; c.wave = 1.2;
          if (carry) {
            b.drop[c.def.id] = [Math.round(c.x * 10) / 10, Math.round(c.z * 10) / 10];
            game.persist();
            placeHiddenShells();
            game.burst(c.x, c.y + 1, c.z, 14, 0xffb0c8, 3.5, 0.6);
            game.sound('ball');
            const left = S.CRABS.filter(q => !b.drop[q.id]).length;
            game.banner('Le crabe lâche son coquillage !', left ? `Encore ${left} crabe${left > 1 ? 's' : ''} farceur${left > 1 ? 's' : ''} sur les plages` : 'Tous les crabes ont rendu les coquillages !', 1800);
          }
        }
      }
    }
    // le Roi des Crabes : un gros « Ouaf ! » et il lâche le parchemin
    if (!b.kingDrop) {
      for (const P of players()) {
        if (!barkedNow(P) || distXZ(P.pos, S.CRAB_KING.x, S.CRAB_KING.z) > 7) continue;
        b.kingDrop = [Math.round((S.CRAB_KING.x + 1.6) * 10) / 10, Math.round((S.CRAB_KING.z + 1.2) * 10) / 10]; game.persist();
        st.kingFlee = 1.6;
        game.sound('ball'); game.burst(S.CRAB_KING.x, S.CRAB_KING.y + 1.5, S.CRAB_KING.z, 18, 0xf2e2b8, 4, 0.6);
        game.banner('Le Roi des Crabes sursaute !', b.talk.barnabe ? 'Il a lâché un morceau de carte : ramasse-le !' : 'Il a lâché un vieux parchemin…', 2400);
      }
    }
    st.kingFlee = Math.max(0, st.kingFlee - dt);
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
      s.x += dx / (d || 1) * Math.min(d, 5 * dt); s.z += dz / (d || 1) * Math.min(d, 5 * dt);
      s.y = S.WATER_Y - 0.15 + Math.sin(game.t * 3) * 0.05; s.swim += dt;
      if (d < 0.5 || s.swim > 12) sealHome();
      return;
    }
    const P = game.party.get(s.owner) || game.player;
    let tx = P.pos.x - Math.sin(P.yaw) * 1.8, tz = P.pos.z - Math.cos(P.yaw) * 1.8;
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
    if (d > 30) { s.x = tx; s.z = tz; }
    else if (d > 0.4) {
      const sp = Math.min(d * 2.2, 7) * dt;
      const n = { x: s.x + dx / d * sp, z: s.z + dz / d * sp };
      game.pushOut(n, s.y, 0.5);
      s.x = n.x; s.z = n.z; s.phase += sp * 3;
      s.yaw = lerpAngle(s.yaw, Math.atan2(dx, dz), Math.min(1, dt * 6));
    }
    const sup = game.support(s.x, s.z, Math.max(s.y, P.pos.y) + 0.6);
    s.y += (Math.max(sup.y, S.WATER_Y - 0.3) - s.y) * Math.min(1, dt * 10);
    if (S.heightAt(s.x, s.z) < S.WATER_Y - 0.02) {
      s.state = 'swim'; s.swim = 0;
      game.burst(s.x, S.WATER_Y + 0.3, s.z, 20, 0xdff8ff, 4, 0.6);
      game.sound('splash');
      game.banner('Plouf ! Le bébé phoque nage !', 'Il file retrouver sa maman, sur le gros rocher…', 2400);
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
    ], () => { game.updateMedalVisibility(); game.banner('Une médaille sur la plage !', 'Elle brille au bord de l\'eau, près des rochers', 2400); game.sound('reveal'); });
  }
  function talkSeal(P) {
    const s = st.seal, b = beach();
    if (s.state !== 'stuck') return;
    if (!b.sardine) {
      b.sealMet = 1; game.persist();
      game.say([
        { who: 'Bébé Phoque', text: 'Ouin… ouin… La mer est partie, et je ne sais plus où elle est… Je veux ma maman !' },
        { who: 'Ainu', text: 'N\'aie pas peur, petit phoque. La mer est juste là : on t\'y emmène !' },
        { who: 'Bébé Phoque', text: 'Je ne peux pas… J\'ai trop faim, je n\'ai plus de force dans les nageoires…' },
        { who: 'Matcha', text: 'Une glace ! Gino, au village, en a de toutes les sortes. Même au poisson, peut-être ?' },
      ], () => { game.updateHud(); game.banner('Le bébé phoque a faim', 'Va voir Gino le glacier, au village', 2600); });
      return;
    }
    game.say([
      { who: 'Bébé Phoque', text: 'Une glace à la sardine ?! Miam miam miam ! Ark ark !' },
      { who: 'Bébé Phoque', text: 'Ça va mieux ! Je vous suis jusqu\'à la mer ! Pas trop vite, hein ?' },
    ], () => { s.state = 'follow'; s.owner = P.id; game.updateHud(); game.banner('Le bébé phoque te suit !', 'Emmène-le jusqu\'à l\'eau', 2200); });
  }

  // =============================================================================
  // Le phare
  // =============================================================================
  const LH = S.LIGHTHOUSE;
  function lightUp() {
    const b = beach();
    if (b.light) return;
    if (b.lenses.length < 3) {
      game.say([{ who: 'Ainu', text: b.talk.perle ? `La lanterne est vide… Il nous manque ${3 - b.lenses.length} lentille${3 - b.lenses.length > 1 ? 's' : ''}.` : 'La lanterne est vide… Il faudrait demander à la gardienne du phare, en bas.' }]);
      return;
    }
    b.light = true; game.persist();
    st.lightT = game.t;
    game.burst(LH.x, LH.top + 1.4, LH.z, 30, 0x8ae8ff, 4, 0.8);
    game.burst(LH.x, LH.top + 1.4, LH.z, 24, 0xfff0a0, 6, 1.0);
    game.sound('lantern');
    game.banner('Le phare brille à nouveau !', 'Les trois lentilles sont en place !', 2800);
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
    const b = beach();
    if (!b.talk.barnabe) {
      b.talk.barnabe = 1; game.persist(); refreshMounds();
      const lines = [
        { who: 'Capitaine Barnabé', text: 'Ohé, les moussaillons ! Capitaine Barnabé, pour vous servir. On s\'est vus à Port-Croquette, pas vrai ?' },
        { who: 'Capitaine Barnabé', text: 'Quand j\'étais jeune, j\'ai caché un trésor sur l\'Île aux Mouettes, là-bas au large. Mais où exactement ? Je ne m\'en souviens plus !' },
        { who: 'Capitaine Barnabé', text: 'J\'avais dessiné une carte… et une tempête l\'a déchirée en trois morceaux.' },
        { who: 'Capitaine Barnabé', text: 'Un morceau dort dans une bouteille, dans la cale de mon vieux bateau échoué, à la Crique de l\'Épave, à l\'est.' },
        { who: 'Capitaine Barnabé', text: 'Un autre est enterré dans un creux des dunes, à l\'ouest, près des trois palmiers penchés. Il faudra creuser !' },
        { who: 'Capitaine Barnabé', text: 'Et le dernier… c\'est le Roi des Crabes qui l\'a pris ! Il se cache dans la Grotte aux Flaques, tout à l\'ouest.' },
        { who: 'Capitaine Barnabé', text: 'Avec les trois morceaux, vous saurez où creuser sur l\'île. Pour y aller : un bodyboard, chez Mistral !' },
        { who: 'Matcha', text: 'Une vraie chasse au trésor ? C\'est le plus beau jour de ma vie !' },
      ];
      if (b.pieces.length) lines.push({ who: 'Capitaine Barnabé', text: `Quoi ? Vous avez déjà ${b.pieces.length} morceau${b.pieces.length > 1 ? 'x' : ''} ? Bravo, mes moussaillons !` });
      game.say(lines, () => { game.updateHud(); game.banner('La chasse au trésor commence !', 'Trois morceaux de carte à retrouver', 2400); });
      return;
    }
    const left = S.MAP_PIECES.filter(p => !b.pieces.includes(p.id));
    if (b.chest) { game.say([{ who: 'Capitaine Barnabé', text: 'Mon trésor retrouvé ! Mes vieilles médailles de marin… et des coquillages en or ! Vous êtes de vrais loups de mer !' }]); return; }
    if (!left.length) { game.say([{ who: 'Capitaine Barnabé', text: 'La carte est complète ! La croix rouge est sur l\'Île aux Mouettes. Prenez un bodyboard au poste de secours et suivez les bouées orange depuis mon ponton !' }]); return; }
    game.say([
      { who: 'Capitaine Barnabé', text: `Il vous manque encore ${left.length} morceau${left.length > 1 ? 'x' : ''} de carte.` },
      ...left.map(p => ({ who: 'Capitaine Barnabé', text: `Cherchez ${p.where}.` })),
    ]);
  }
  function talkPerle() {
    const b = beach();
    if (b.light) { game.say([{ who: 'Gardienne Perle', text: 'Regardez comme il brille ! Les bateaux rentreront au port en toute sécurité. Merci, mes toutous !' }]); return; }
    if (!b.talk.perle) {
      b.talk.perle = 1; game.persist();
      game.say([
        { who: 'Gardienne Perle', text: 'Bonjour, petits chiens ! Je suis Perle, la gardienne du phare. Oh là là, quelle catastrophe…' },
        { who: 'Gardienne Perle', text: 'Les chats de la Capitaine ont volé les trois lentilles de ma lanterne, pour jouer avec ! Sans elles, plus de lumière.' },
        { who: 'Gardienne Perle', text: 'Ce sont de grosses pierres bleues qui brillent. Les chats les ont cachées tout en haut de leurs endroits préférés.' },
        { who: 'Gardienne Perle', text: 'Une en haut du mât de l\'épave, une au sommet de la Grande Dune, et une sur le rocher au-dessus de la Grotte aux Flaques.' },
        { who: 'Gardienne Perle', text: 'Rapportez-les, puis montez l\'escalier du phare et rallumez la lanterne !' },
        { who: 'Ainu', text: 'Ouaf ! On les retrouve, promis !' },
      ], () => game.updateHud());
      return;
    }
    const n = b.lenses.length;
    if (n >= 3) { game.say([{ who: 'Gardienne Perle', text: 'Les trois lentilles ! Vite, montez l\'escalier du phare jusqu\'à la lanterne et rallumez-la !' }]); return; }
    game.say([
      { who: 'Gardienne Perle', text: `Vous avez ${n} lentille${n > 1 ? 's' : ''} sur 3.` },
      ...S.LENSES.filter(l => !b.lenses.includes(l.id)).map(l => ({ who: 'Gardienne Perle', text: `Il en reste une ${l.where}.` })),
    ]);
  }
  function talkGino(P) {
    const b = beach();
    if (b.sealMet && !b.sardine && b.seal !== 'home') {
      b.sardine = 1; game.persist();
      game.say([
        { who: 'Gino le glacier', text: 'Buongiorno ! Une glace pour un bébé phoque affamé ? J\'ai exactement ce qu\'il faut…' },
        { who: 'Gino le glacier', text: 'La glace à la sardine ! Ma spécialité. Les phoques l\'adorent… les chiens, un peu moins !' },
        { who: 'Matcha', text: 'Beurk… Mais merci, Gino ! Vite, à la grotte !' },
      ], () => { game.updateHud(); game.banner('Glace à la sardine !', 'Apporte-la au bébé phoque, dans la Grotte aux Flaques', 2600); });
      return;
    }
    if (!b.talk.gino) {
      b.talk.gino = 1; game.persist();
      game.say([
        { who: 'Gino le glacier', text: 'Buongiorno, les toutous ! Gino, le meilleur glacier de toute la plage !' },
        { who: 'Gino le glacier', text: 'Une petite glace ? C\'est gratuit pour les héros : ça redonne toutes les forces !' },
        { who: 'Gino le glacier', text: 'Et à côté, mon chamboule-tout ! Faites tomber les trois pyramides de boîtes, et je vous offre des coquillages.' },
      ], () => { for (const Q of players()) Q.hearts = Math.max(Q.hearts, 3); game.sound('heart'); game.updateHud(); });
      return;
    }
    for (const Q of players()) Q.hearts = Math.max(Q.hearts, 3);
    game.sound('heart'); game.updateHud();
    game.burst(P.pos.x, P.pos.y + 1.5, P.pos.z, 12, 0xff9ac8, 3, 0.6);
    game.banner('Une glace à la fraise !', 'Miam ! Les cœurs sont pleins.', 1800);
  }
  function talkMistral() {
    const b = beach(), k = game.controlsHelp();
    if (st.race && st.race.ph !== 'ready') return;
    if (!b.talk.mistral) {
      b.talk.mistral = 1; game.persist();
      game.say([
        { who: 'Maître-Nageur Mistral', text: 'Salut les toutous ! Maître-Nageur Mistral, gardien de la plage. Ici, on s\'amuse… et on fait attention !' },
        { who: 'Maître-Nageur Mistral', text: 'Vous voyez les bodyboards, sur le râtelier ? Approchez-vous et montez : on glisse sur les vagues !' },
        { who: 'Maître-Nageur Mistral', text: `Sur la planche : vers l'avant pour avancer, à gauche ou à droite pour tourner, ${k.dash} pour la vague turbo.` },
        { who: 'Maître-Nageur Mistral', text: 'D\'abord, une petite leçon : passez dans mes trois bouées vertes, juste devant le poste. Ensuite, on fera la grande course !' },
        { who: 'Maître-Nageur Mistral', text: 'Ah, et j\'entends un bébé phoque pleurer dans la Grotte aux Flaques, tout à l\'ouest. Vous pourriez l\'aider ?' },
        { who: 'Ainu', text: 'Ouaf ! On y va !' },
      ], () => raceReady('lesson'));
      return;
    }
    if (st.race) { game.say([{ who: 'Maître-Nageur Mistral', text: st.race.kind === 'lesson' ? 'Prenez une planche et passez dans les trois bouées vertes, devant le poste !' : 'Je vous attends à la bouée de départ, juste devant le poste ! Prenez une planche.' }]); return; }
    if (!b.lesson) { game.say([{ who: 'Maître-Nageur Mistral', text: 'On recommence la leçon ? Prenez une planche et passez dans les trois bouées vertes, dans l\'ordre.' }], () => raceReady('lesson')); return; }
    const won = b.raceWon;
    game.say([
      { who: 'Maître-Nageur Mistral', text: won ? `Une revanche ? Votre record est de ${b.raceBest ? b.raceBest.toFixed(1) : '…'} secondes. Je vais m'entraîner !` : 'Bravo pour la leçon ! Maintenant, la grande course ?' },
      { who: 'Maître-Nageur Mistral', text: 'Départ devant le poste. On fait le tour des bouées jaunes : jusqu\'au large, près de l\'île, puis on revient sous le ponton !' },
      ...(b.seal !== 'home' ? [{ who: 'Maître-Nageur Mistral', text: 'Et n\'oubliez pas le bébé phoque, dans la Grotte aux Flaques !' }] : []),
    ], () => raceReady('race'));
  }

  // =============================================================================
  // Interface avec le moteur
  // =============================================================================
  const lab = (btn, tx) => { const e = game.dom.root.querySelector(`.adv-btn.${btn} span`); if (e && e.textContent !== tx) e.textContent = tx; };
  const fortFree = () => S.cats.filter(c => c.group === 'clearing').every(c => save().cats.includes(c.id)) && S.FORT_FLAGS.every(f => beach().flags.includes(f.id));

  // --- la couche de vie : bêtes, objets, défis éclair, habitants, cachettes (life.js) ---------
  const life = buildLife(game, { L: S, plan: LIFE.PLAN, palette: LIFE.PALETTE, lines: LIFE.LINES, mats: Object.fromEntries(Object.entries(LIFE.MATS).map(([k, [skin, o]]) => [k, skinMaterial(skin, o)])), surface: (x, z) => Math.max(S.heightAt(x, z), S.WATER_Y), isWater: (x, z) => S.heightAt(x, z) < S.WATER_Y - 0.02, view: lite ? 60 : undefined, active: lite ? 50 : undefined, liteDetail: 20, allDoneText: 'Toute la plage fait la fête : les dauphins sautent pour vous !' });

  const logic = {
    moving, chars, life,
    playerStep(P, wx, wz, jumpHeld, pr, dt) {
      if (P.board) {
        if (pr.has('talk') && !game.dialog && game.freeze <= 0) {
          pr.delete('talk');
          const n = P.nearby;
          if (n && n.act === 'mistral') talkMistral(); else unmountBoard(P);
          return true;
        }
        rideBoard(P, P.board, wx, wz, jumpHeld, pr, dt);
        return true;
      }
      if (P.digT > 0) { stepDig(P, dt); return true; }
      if (pr.has('attack') && !game.dialog && game.freeze <= 0 && !(P.attackT > 0)) {
        const d = moundNear(P);
        if (d) { pr.delete('attack'); startDig(P, d); stepDig(P, dt); return true; }
      }
      return false;
    },
    nearFor(Q) {
      if (Q.board) {
        if (distXZ(Q.pos, mistral.position.x, mistral.position.z) < 5 && !rival.on) return { kind: 'lv', act: 'mistral', label: 'PARLER', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y };
        return { kind: 'lv', act: 'unboard', label: 'DESCENDRE', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y };
      }
      if (Q.digT > 0) return null;
      return undefined;
    },
    extraCandidates(Q) {
      const out = Q ? life.candidates(Q) : [], b = beach();
      const d = moundNear(Q);
      if (d) out.push({ kind: 'lv', act: 'dig', id: d.id, label: 'CREUSER', x: Q.pos.x + (d.x - Q.pos.x) * 0.2, z: Q.pos.z + (d.z - Q.pos.z) * 0.2, y: d.y });
      if (boards.some(bd => bd.driver < 0)) out.push({ kind: 'lv', act: 'board', label: 'SURFER', x: RK.x, z: RK.z, y: RK.y });
      for (const bd of boards) if (bd.driver < 0 && bd.park && distXZ(Q.pos, bd.park.x, bd.park.z) < 5) out.push({ kind: 'lv', act: 'board', i: bd.i, label: 'SURFER', x: bd.park.x, z: bd.park.z, y: Math.max(S.WATER_Y, S.heightAt(bd.park.x, bd.park.z)) });
      for (const k of ['barnabe', 'perle', 'gino']) out.push({ kind: 'lv', act: k, label: k === 'gino' ? 'GLACE' : 'PARLER', x: G[k].x, z: G[k].z, y: G[k].y });
      out.push({ kind: 'lv', act: 'mistral', label: 'PARLER', x: mistral.position.x, z: mistral.position.z, y: G.mistral.y });
      if (st.seal.state === 'stuck' && b.seal !== 'home') out.push({ kind: 'lv', act: 'seal', label: 'AIDER', x: st.seal.x, z: st.seal.z, y: st.seal.y });
      if (!b.light) out.push({ kind: 'lv', act: 'light', label: 'ALLUMER', x: LH.x, z: LH.z + 1.6, y: LH.top });
      return out;
    },
    interact(n, P) {
      if (n.life) { life.interact(n, P); return; }
      if (n.act === 'dig') { const d = moundDefs.find(q => q.id === n.id); if (d && !P.board) startDig(P, d); }
      else if (n.act === 'board') mountBoard(P, n.i !== undefined ? boards[n.i] : freeBoard());
      else if (n.act === 'unboard') unmountBoard(P);
      else if (n.act === 'barnabe') talkBarnabe();
      else if (n.act === 'mistral') talkMistral();
      else if (n.act === 'perle') talkPerle();
      else if (n.act === 'gino') talkGino(P);
      else if (n.act === 'seal') talkSeal(P);
      else if (n.act === 'light') lightUp();
    },
    step(dt) {
      stepFreeBoards();
      stepRace(dt);
      stepCrabs(dt);
      stepSeal(dt);
      stepFlags();
      stepFort();
      stepCans(dt);
      stepPickups();
      life.step(dt);
      const me = game.me;
      if (!st.hints.water && !me.board && me.pos.y < S.WATER_Y - 0.35 && save().intro) { st.hints.water = 1; game.localBanner('Attention, ça devient profond !', 'Pour aller dans les vagues : prends un bodyboard au poste de secours.', 3000); }
      if (st.chestT >= 0) st.chestT += dt;
    },
    questText() {
      const s = save(), b = beach(), n = s.medals.length;
      if (!s.intro) return 'Parle à Mamie Labrador';
      const lq = life.questText(); if (lq) return lq;
      if (st.race) {
        const lesson = st.race.kind === 'lesson';
        if (st.race.ph === 'ready') return lesson ? 'Sur une planche, va aux bouées vertes devant le poste' : 'Sur une planche, rejoins Mistral à la bouée de départ';
        if (st.race.ph === 'count') return 'Attention… prêts ?';
        const i = st.race.next[game.me.id], N2 = course().length;
        return i === undefined ? 'La course est lancée !' : `${lesson ? 'Leçon' : 'Course'} ! Bouée ${Math.min(i + 1, N2)}/${N2}`;
      }
      if (st.seal.state === 'follow') return 'Ramène le bébé phoque jusqu\'à la mer';
      if (n >= S.medals.length) return `Plage sauvée ! Coquillages ${s.bones.length}/100`;
      if (b.pieces.length >= 3 && !b.chest) return 'Creuse sous la croix rouge, sur l\'Île aux Mouettes';
      if (b.lenses.length >= 3 && !b.light) return 'Rallume la lanterne, en haut du phare';
      if (b.sardine && b.seal !== 'home') return 'Apporte la glace au bébé phoque (Grotte aux Flaques)';
      return `Médailles de la plage ${n}/5 · explore et parle aux habitants « ! »`;
    },
    guideTarget(me) {
      const b = beach();
      if (st.race && st.race.ph === 'ready') { const p = st.race.kind === 'lesson' ? S.LESSON[0] : RC.start; return { x: p.x, y: S.WATER_Y, z: p.z }; }
      if (st.race) { const i = st.race.next[me.id]; if (i !== undefined) { const list = course(), bu = list[Math.min(i, list.length - 1)]; return { x: bu.x, y: S.WATER_Y, z: bu.z }; } }
      if (st.seal.state === 'follow') return { x: S.SEAL_HOME.x, y: S.WATER_Y, z: S.SEAL_HOME.z };
      return goalNow(me);
    },
    reveal() {
      const b = beach();
      return { m_light: !!b.light, m_chest: !!b.chest, m_seal: b.seal === 'home', m_race: !!b.raceWon, m_fort: fortFree() };
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
      for (const k of ['barnabe', 'mistral', 'perle', 'gino']) if (marks[k].visible) out.push([k === 'mistral' ? mistral.position.x : G[k].x, k === 'mistral' ? mistral.position.z : G[k].z, '#ff9a2a', 4, true]);
      if (b.pieces.length >= 3 && !b.chest) out.push([S.CHEST.x, S.CHEST.z, '#e02a2a', 4.5, true]);
      if (b.seal !== 'home' && (b.sealMet || st.seal.state === 'follow')) out.push([st.seal.x, st.seal.z, '#ffffff', 3.5, true]);
      if (b.talk.perle) for (const l of S.LENSES) if (!b.lenses.includes(l.id)) out.push([l.x, l.z, '#8ae8ff', 3.5, true]);
      out.push([RK.x, RK.z, '#3ab0ff', 3]);
      for (const bd of boards) if (bd.park && bd.driver < 0) out.push([bd.park.x, bd.park.z, '#3ab0ff', 2.4]);
      for (const d of S.MOUNDS) if (!dug(d.id)) out.push([d.x, d.z, '#fff2b0', 2]);
      for (const c of crabs) if (!b.drop[c.def.id]) out.push([c.x, c.z, '#ff5a3a', 2.2]);
      S.CHECKPOINTS.forEach((c, i) => out.push([c.x, c.z, i === b.cp ? '#8ad8ff' : '#ffffff', 2.4]));
      if (st.race && st.race.ph === 'go') { const i = st.race.next[game.me.id], list = course(); if (i !== undefined && i < list.length) out.push([list[i].x, list[i].z, '#ffd23a', 4.5, true]); }
      else if (st.race) { const p = st.race.kind === 'lesson' ? S.LESSON[0] : RC.start; out.push([p.x, p.z, '#ffd23a', 4.5, true]); }
      if (rival.on) out.push([rival.x, rival.z, '#ffffff', 2.8]);
      for (const m of life.marks()) out.push(m);
      return out;
    },
    snapshot() {
      const r = (x) => Math.round(x * 100) / 100;
      const R = st.race;
      return {
        b: boards.map(b => [r(b.x), r(b.y), r(b.z), r(b.yaw), b.driver, r(b.speed), b.boost > 0 ? 1 : 0, b.spin > 0 ? 1 : 0, b.park ? [r(b.park.x), r(b.park.z), r(b.park.yaw)] : 0]),
        rv: rival.on ? [r(rival.x), r(rival.y), r(rival.z), r(rival.yaw), r(rival.speed)] : 0,
        rc: R ? [R.ph, r(R.t), R.next, R.lock, R.kind] : 0,
        k: crabs.map(c => [r(c.x), r(c.y), r(c.z), r(c.yaw), r(c.phase), c.wave > 0 ? 1 : 0]),
        se: [st.seal.state, r(st.seal.x), r(st.seal.y), r(st.seal.z), r(st.seal.yaw), r(st.seal.phase)],
        d: players().filter(p => p.digT > 0).map(p => [p.id, r(p.digT)]),
        ch: st.chestT >= 0 ? r(st.chestT) : -1,
        cn: stacks.map(s => (s.down ? 1 : 0)),
        lf: life.snapshot(),
      };
    },
    apply(x) {
      x.b.forEach((d, i) => { const b = boards[i]; if (!b) return; b.x = d[0]; b.y = d[1]; b.z = d[2]; b.yaw = d[3]; b.driver = d[4]; b.speed = d[5]; b.boost = d[6] ? 1 : 0; b.spin = d[7] ? 0.3 : 0; b.park = d[8] ? { x: d[8][0], z: d[8][1], yaw: d[8][2] } : null; });
      for (const P of players()) P.board = null;
      for (const b of boards) if (b.driver >= 0 && game.party.has(b.driver)) game.party.get(b.driver).board = b;
      if (x.rv) { rival.on = true; [rival.x, rival.y, rival.z, rival.yaw, rival.speed] = x.rv; } else rival.on = false;
      const prev = st.race ? st.race.ph : '';
      st.race = x.rc ? { ph: x.rc[0], t: x.rc[1], next: x.rc[2] || {}, lock: x.rc[3] || [], kind: x.rc[4] } : null;
      if ((st.race ? st.race.ph : '') !== prev) game.updateHud();
      x.k.forEach((d, i) => { const c = crabs[i]; if (!c) return; c.x = d[0]; c.y = d[1]; c.z = d[2]; c.yaw = d[3]; c.phase = d[4]; c.wave = d[5] ? 0.5 : 0; });
      const s = st.seal, was = s.state;
      [s.state, s.x, s.y, s.z, s.yaw, s.phase] = x.se;
      if (was !== s.state) game.updateHud();
      const digs = new Map(x.d);
      for (const P of players()) P.digT = digs.get(P.id) || 0;
      st.chestT = x.ch;
      (x.cn || []).forEach((v, i) => { if (stacks[i]) stacks[i].down = !!v; });
      life.apply(x.lf);
    },
    talkMamie(first) {
      const s = save(), k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Bienvenue à la Plage aux Coquillages, mes toutous ! Ici, c\'est soleil, vagues et châteaux de sable.' },
          { who: 'Biscotte', text: 'Des coquillages partout ! Je peux en garder un, Mamie ?' },
          { who: 'Mamie Labrador', text: 'Il y en a cent à trouver, sur toute la côte ! Et regardez : les petits tas de sable qui brillent cachent des trésors.' },
          { who: 'Mamie Labrador', text: `Approchez-vous d'un tas qui brille et appuyez sur ${k.attack} : vous creusez !` },
          { who: 'Mamie Labrador', text: 'La plage est grande : le village, la Grande Plage, les dunes, les rochers, la falaise du phare, la Crique de l\'Épave… et une île, au large !' },
          { who: 'Mamie Labrador', text: 'Les habitants qui ont besoin d\'aide ont un « ! » au-dessus de la tête : Gino le glacier, ici au village ; Mistral au poste de secours ; Barnabé au bout du ponton ; Perle au phare.' },
          { who: 'Mamie Labrador', text: 'Et méfiez-vous : les chats de la Capitaine Moustache ont bâti un fort de sable, et des crabes farceurs chipent les coquillages. Un bon « Ouaf ! » et ils lâchent tout !' },
          { who: 'Matcha', text: 'Cinq médailles à gagner ? Ainu, on commence par où ?' },
          { who: 'Ainu', text: 'Ouaf ! Par une glace chez Gino, puis la plage !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Trouve les 5 médailles de la plage !', 2800); game.updateHud(); });
        return;
      }
      const b = beach();
      if (s.medals.length >= S.medals.length) { game.say([{ who: 'Mamie Labrador', text: `La plage est à vous, mes toutous ! Il reste peut-être des coquillages à trouver : ${s.bones.length} sur 100.` }]); return; }
      const lines = [{ who: 'Mamie Labrador', text: `Vous avez ${s.medals.length} médaille${s.medals.length > 1 ? 's' : ''} sur 5. Bravo !` }];
      const r = this.reveal();
      if (!r.m_fort) lines.push({ who: 'Mamie Labrador', text: 'Les chats tiennent toujours leur fort de sable, à l\'ouest de la Grande Plage. Chassez-les, et faites tomber leurs drapeaux, sur les tours !' });
      if (!r.m_chest) lines.push({ who: 'Mamie Labrador', text: b.talk.barnabe ? 'Pour la carte de Barnabé : l\'épave, à l\'est ; les dunes, à l\'ouest ; et la grotte, tout au bout des rochers.' : 'Allez voir le Capitaine Barnabé, au bout du grand ponton : il cherche son trésor…' });
      if (!r.m_light) lines.push({ who: 'Mamie Labrador', text: b.talk.perle ? 'Les lentilles du phare brillent en bleu, tout en haut : du mât de l\'épave, de la Grande Dune, du rocher de la grotte.' : 'Le phare, au bout de la falaise de l\'est, est tout éteint. Perle, la gardienne, vous attend là-haut.' });
      if (!r.m_seal) lines.push({ who: 'Mamie Labrador', text: 'J\'ai entendu un petit phoque pleurer dans la Grotte aux Flaques, tout à l\'ouest…' });
      if (!r.m_race) lines.push({ who: 'Mamie Labrador', text: 'Et Mistral vous attend pour une leçon de bodyboard, puis une course !' });
      game.say(lines.slice(0, 3));
    },
    endLines() {
      const kid = window.kidName ? window.kidName() : '';
      return [
        { who: 'Mamie Labrador', text: 'Les cinq médailles de la plage ! Le phare brille, le trésor est retrouvé, et le bébé phoque nage avec sa maman.' },
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
      const me = game.me, b = beach(), cam = game.camera.position;
      decor.surfMat.uniforms.uTime.value = t;
      if (!st.vista && game.vista) { st.vista = true; for (const i of game.vista.isles) i.visible = false; }
      // le décor lointain est caché (grand monde)
      const far0 = lite ? 165 : 250;
      for (const c of cull) c.obj.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < (c.far || far0) + c.r;
      const seeIt = (x, z, r) => Math.hypot(x - cam.x, z - cam.z) < (r || (lite ? 120 : 180));
      // boutons tactiles sur la planche
      const mode = me.board ? 'board' : '';
      if (mode !== st.btn) { st.btn = mode; lab('dash', mode ? 'Turbo' : 'Charge'); lab('attack', mode ? 'Figure' : 'Attaque'); }
      // en planche : caméra un peu plus loin, et toujours derrière la planche (sauf si on la tourne au doigt)
      if (me.board) {
        game.camDistOverride = 11; st.camSet = true;
        if (game.t - game.lastCamManual > 1.2) game.camYaw = lerpAngle(game.camYaw, me.yaw + Math.PI, Math.min(1, dt * 3.2));
      } else if (st.camSet) { game.camDistOverride = null; st.camSet = false; }
      // planches
      for (const bd of boards) {
        const P = bd.driver >= 0 ? game.party.get(bd.driver) : null;
        const u = bd.m.userData;
        if (!P) {
          if (bd.park) {
            const y = Math.max(S.WATER_Y + 0.05 + S.swell(bd.park.x, bd.park.z, t), S.heightAt(bd.park.x, bd.park.z) + 0.05);
            bd.m.position.set(bd.park.x, y, bd.park.z); bd.m.rotation.set(0, bd.park.yaw, Math.sin(t * 1.3 + bd.i) * 0.05, 'YXZ');
          } else { bd.m.position.set(bd.slot.x, bd.slot.y, bd.slot.z); bd.m.rotation.set(-1.25, 0.15, 0); }
          bd.m.visible = seeIt(bd.m.position.x, bd.m.position.z);
          u.spray.material.opacity = 0;
          continue;
        }
        bd.m.visible = true;
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
        const m = S.MOUNDS.find(q => q.id === id);
        for (const s of S.bones) {
          if (s.mound !== id) continue;
          if (k >= 1) { s.x = s.x0; s.z = s.z0; s.y = s.y0; continue; }
          s.x = m.x + (s.x0 - m.x) * k; s.z = m.z + (s.z0 - m.z) * k; s.y = m.y + (s.y0 - m.y) * k + Math.sin(k * Math.PI) * 2.2;
        }
        if (k >= 1) delete st.popAt[id];
      }
      for (const d of S.MOUNDS) if (dug(d.id) && !st.digSeen.has(d.id)) { st.digSeen.add(d.id); if (game.t > 2 && !st.popAt[d.id] && isGuest()) st.popAt[d.id] = t; }
      // étincelles des tas
      {
        const pa = sparkGeo.attributes.position.array, sa = sparkGeo.attributes.size.array;
        moundDefs.forEach((d, i) => {
          const done = moundDone(d), hide = !moundShown(d), close = seeIt(d.x, d.z, 90);
          for (let k = 0; k < 3; k++) {
            const j = i * 3 + k, ph = t * (1.3 + k * 0.4) + i * 2.1 + k * 2.4, a = ph * 0.7 + k * 2.1;
            pa[j * 3] = d.x + Math.cos(a) * 0.55; pa[j * 3 + 1] = d.y + 0.3 + (ph % 1.6) * 0.5; pa[j * 3 + 2] = d.z + Math.sin(a) * 0.55;
            sa[j] = done || hide || !close ? 0 : Math.max(0, Math.sin(ph * 2.3)) * (special(d) ? 0.75 : 0.5);
          }
        });
        sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.size.needsUpdate = true;
        sparkMat.uniforms.uScale.value = game.partPts.material.uniforms.uScale.value;
      }
      // coffre : il sort du sable et s'ouvre
      if (b.chest) {
        chest.visible = seeIt(S.CHEST.x, S.CHEST.z);
        const k = st.chestT >= 0 ? clamp(st.chestT / 1.0, 0, 1) : 1;
        chest.position.y = S.CHEST.y - 1.2 + k * 1.25;
        chest.userData.lid.rotation.x = -clamp((st.chestT >= 0 ? st.chestT - 0.9 : 1) / 0.5, 0, 1) * 1.9;
        chest.userData.glow.material.opacity = (st.chestT < 0 || st.chestT > 1) ? 0.45 + Math.sin(t * 3) * 0.15 : 0;
      } else chest.visible = false;
      xMark.visible = b.pieces.length >= 3 && !b.chest && seeIt(S.CHEST.x, S.CHEST.z);
      // lentilles, bouteille, parchemin, drapeaux du fort, chamboule-tout
      for (const l of lenses) {
        const got = b.lenses.includes(l.def.id);
        l.m.visible = !got && seeIt(l.def.x, l.def.z, 200);
        if (l.m.visible) { l.m.position.y = l.def.y + Math.sin(t * 2 + l.def.x) * 0.15; l.m.userData.gem.rotation.y = t * 1.6; }
      }
      bottle.visible = !!b.talk.barnabe && !b.pieces.includes('p1') && seeIt(bottle.position.x, bottle.position.z);
      bottle.rotation.y = t * 0.8;
      scroll.visible = !!b.kingDrop && !b.pieces.includes('p3');
      if (scroll.visible) { scroll.position.set(b.kingDrop[0], S.groundY(b.kingDrop[0], b.kingDrop[1]) + 0.6 + Math.sin(t * 3) * 0.1, b.kingDrop[1]); scroll.rotation.y = t * 1.5; }
      for (const f of fortFlags) {
        const down = b.flags.includes(f.def.id);
        f.fall = down ? Math.min(1, f.fall + dt * 2) : 0;
        f.m.rotation.z = f.fall * 1.5; f.m.position.y = f.def.y - f.fall * 0.3;
        f.m.visible = seeIt(f.def.x, f.def.z) && f.fall < 1;
        if (f.m.visible && !down) {
          const arr = f.m.userData.cloth.geometry.attributes.position.array, base = f.m.userData.base;
          for (let k = 0; k < arr.length; k += 3) { const x = base[k]; arr[k + 2] = Math.sin(x * 5 - t * 7) * 0.1 * x; }
          f.m.userData.cloth.geometry.attributes.position.needsUpdate = true;
        }
      }
      for (const s of stacks) {
        s.m.visible = seeIt(s.def.x, s.def.z, 90);
        s.m.userData.cans.forEach((c, i) => {
          const [hx, hy] = c.userData.home;
          if (s.down) { const k = Math.min(1, s.t * 2.5); c.position.set(hx + Math.sin(i * 2.3) * 0.8 * k, Math.max(0.2, hy - k * hy) , -0.6 * k - (i % 2) * 0.3 * k); c.rotation.set(k * 1.5, 0, k * (i - 2.5) * 0.6); }
          else { c.position.set(hx, hy, 0); c.rotation.set(0, 0, 0); }
        });
      }
      // le Roi des Crabes
      {
        const ku = king.userData, kd = !!b.kingDrop;
        kingScroll.visible = !kd;
        king.position.set(S.CRAB_KING.x + (st.kingFlee > 0 ? Math.sin(st.kingFlee * 20) * 0.1 : 0), S.CRAB_KING.y + (st.kingFlee > 0 ? Math.abs(Math.sin(st.kingFlee * 8)) * 0.6 : 0), S.CRAB_KING.z);
        const dd = Math.hypot(me.pos.x - S.CRAB_KING.x, me.pos.z - S.CRAB_KING.z);
        king.rotation.y = lerpAngle(king.rotation.y, Math.atan2(me.pos.x - S.CRAB_KING.x, me.pos.z - S.CRAB_KING.z) + (kd ? Math.PI : 0), Math.min(1, dt * 2));
        ku.claws.forEach((cl, i) => { cl.rotation.x = dd < 10 ? -0.8 + Math.sin(t * 9 + i * Math.PI) * 0.5 : -0.3; });
        ku.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 3 + i) * 0.2; });
        if (!kd && dd < 9 && Math.floor(t / 3) !== Math.floor((t - dt) / 3)) { st.capPos.set(king.position.x, king.position.y + 1.8, king.position.z); game.bubble({ pos: st.capPos.clone(), small: true }, 'Clac clac !'); }
      }
      // rival (Mistral) sur sa planche pendant la course
      rival.m.visible = rival.on;
      const MG = G.mistral;
      if (rival.on) {
        rival.m.position.set(rival.x, rival.y, rival.z); rival.m.rotation.set(-0.05, rival.yaw, 0, 'YXZ');
        rival.m.userData.spray.material.opacity = clamp((rival.speed - 3) / 10, 0, 0.8);
        mistral.position.set(rival.x, rival.y + 0.12, rival.z); mistral.rotation.set(0.05, rival.yaw, 0);
      } else {
        mistral.position.set(MG.x, MG.y, MG.z); mistral.rotation.x = 0;
        const d = Math.hypot(me.pos.x - MG.x, me.pos.z - MG.z);
        mistral.rotation.y = lerpAngle(mistral.rotation.y, d < 9 ? Math.atan2(me.pos.x - MG.x, me.pos.z - MG.z) : MG.yaw, Math.min(1, dt * 3));
      }
      mistral.visible = seeIt(mistral.position.x, mistral.position.z);
      for (const k of ['barnabe', 'perle', 'gino', 'mistral']) {
        const npc = NPC[k], def = G[k], u = npc.userData;
        if (u.mtail) u.mtail.rotation.y = Math.sin(t * 7 + def.x) * 0.5;
        if (u.tail && u.realistic) u.tail.rotation.y = Math.sin(t * 7 + def.x) * 0.4;
        const hd = u.mhead || u.head; if (hd) hd.rotation.x = Math.sin(t * 2 + def.z) * 0.06;
        if (k !== 'mistral') { const d = Math.hypot(me.pos.x - def.x, me.pos.z - def.z); npc.rotation.y = lerpAngle(npc.rotation.y, d < 8 ? Math.atan2(me.pos.x - def.x, me.pos.z - def.z) : def.yaw, Math.min(1, dt * 3)); }
      }
      const intro = save().intro;
      const want = {
        barnabe: !b.talk.barnabe || (b.pieces.length >= 3 && !b.chest),
        mistral: !rival.on && !st.race && (!b.talk.mistral || !b.raceWon),
        perle: !b.talk.perle || (b.lenses.length >= 3 && !b.light),
        gino: !b.talk.gino || (b.sealMet && !b.sardine && b.seal !== 'home'),
      };
      for (const k in want) {
        marks[k].visible = intro && want[k] && seeIt(NPC[k].position.x, NPC[k].position.z, 160);
        marks[k].position.set(NPC[k].position.x, NPC[k].position.y + 2.9 + Math.sin(t * 4) * 0.1, NPC[k].position.z);
      }
      // crabes
      for (const c of crabs) {
        const u = c.m.userData, carry = !b.drop[c.def.id];
        c.m.visible = seeIt(c.x, c.z);
        if (!c.m.visible) continue;
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
          marks.seal.visible = intro && s.state === 'stuck' && seeIt(s.x, s.z, 120);
          marks.seal.position.set(s.x, s.y + 1.6 + Math.sin(t * 4) * 0.1, s.z);
          babyShadow.visible = s.state !== 'swim';
          game.placeShadow(babyShadow, baby.position, 0.6);
          if (s.state === 'stuck' && Math.floor(t * 0.5) !== Math.floor((t - dt) * 0.5) && Math.hypot(me.pos.x - s.x, me.pos.z - s.z) < 22) game.bubble({ pos: baby.position, small: true }, 'Ouin !');
        }
        baby.visible = seeIt(baby.position.x, baby.position.z);
        mama.userData.head.rotation.x = Math.sin(t * 1.5) * 0.15;
        mama.position.y = S.SEAL_ROCK.top - 0.05 + Math.abs(Math.sin(t * 1.2)) * 0.03;
      }
      // leçon / course : l'anneau de la prochaine bouée
      const R = st.race, ni = R && R.next ? R.next[me.id] : undefined, list = course();
      const bu = R ? (R.ph === 'go' && ni !== undefined ? list[Math.min(ni, list.length - 1)] : (R.kind === 'lesson' ? S.LESSON[0] : RC.start)) : null;
      ring.visible = ringBeam.visible = !!bu;
      if (bu) {
        const col = R.kind === 'lesson' ? 0x5ad85a : 0xffd23a;
        ring.material.color.setHex(col);
        ring.position.set(bu.x, S.WATER_Y + 0.35 + Math.sin(t * 3) * 0.1, bu.z); ring.rotation.z = t; ringBeam.position.set(bu.x, S.WATER_Y + 13, bu.z);
      }
      // rayon d'aide au-dessus du but de la quête en cours (quand on est loin)
      {
        const g = R ? null : goalNow(me);
        hint.visible = !!g && Math.hypot(g.x - me.pos.x, g.z - me.pos.z) > 25 && !!intro;
        if (hint.visible) hint.position.set(g.x, (g.y || 0) + 15, g.z);
      }
      // le phare
      {
        const lit = !!b.light, k = lit ? clamp(st.lightT >= 0 ? (t - st.lightT) / 1.5 : 1, 0, 1) : 0;
        const lm = decor.lh.lamp.material;
        lm.emissiveIntensity = lit ? 0.4 + 1.1 * k : 0;
        if (lm.color) lm.color.setHex(lit ? 0xfff6d0 : 0x8a8a7a);
        decor.lh.beam.material.opacity = 0.16 * k; decor.lh.beam.rotation.y = t * 0.8;
        decor.lh.halo.material.opacity = 0.75 * k * (0.85 + Math.sin(t * 4) * 0.15);
      }
      // drapeaux
      decor.flags.forEach((f, i) => {
        const up = i === b.cp ? 1 : 0;
        f.raise += (up - f.raise) * Math.min(1, dt * 3);
        f.cloth.position.y = 1.0 + f.raise * 2.45;
        if (!f.g.visible) return;
        const arr = f.cloth.geometry.attributes.position.array;
        for (let k = 0; k < arr.length; k += 3) { const x = f.base[k]; arr[k + 2] = Math.sin(x * 3 - t * 6 + i) * 0.12 * x; }
        f.cloth.geometry.attributes.position.needsUpdate = true;
        const since = t - f.raisedAt;
        f.halo.material.opacity = since < 1.5 ? (1 - since / 1.5) * 0.8 : (up ? 0.22 + Math.sin(t * 3) * 0.08 : 0);
        f.halo.scale.setScalar(since < 1.5 ? 1 + since * 2 : 1);
      });
      if (seeIt(S.FORT.x, S.FORT.z)) for (const c of decor.fort.flags) {
        const arr = c.geometry.attributes.position.array, base = c.userData.base;
        for (let k = 0; k < arr.length; k += 3) { const x = base[k]; arr[k + 2] = Math.sin(x * 5 - t * 7) * 0.1 * x; }
        c.geometry.attributes.position.needsUpdate = true;
      }
      // la Capitaine sur sa tour : elle nargue… puis applaudit quand le fort est libéré
      {
        const cap = decor.fort.cap, cu = cap.userData, free = fortFree();
        const d = Math.hypot(me.pos.x - S.KEEP.x, me.pos.z - S.KEEP.z);
        cap.visible = d < (lite ? 120 : 180);
        cap.rotation.y = lerpAngle(cap.rotation.y, Math.atan2(me.pos.x - S.KEEP.x, me.pos.z - S.KEEP.z), Math.min(1, dt * 2));
        cap.position.y = S.KEEP.top + (free ? Math.abs(Math.sin(t * 5)) * 0.25 : 0);
        if (cu.head) cu.head.rotation.z = Math.sin(t * (free ? 8 : 2)) * (free ? 0.2 : 0.08);
        if (cu.tail) cu.tail.rotation.x = -0.3 + Math.sin(t * 4) * 0.3;
        if (!free && d < 14 && Math.floor(t / 4) !== Math.floor((t - dt) / 4)) { st.capPos.set(cap.position.x, cap.position.y + 1.7, cap.position.z); game.bubble({ pos: st.capPos.clone(), small: true }, 'Miaou-ha !'); }
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
      decor.boat.position.y = S.WATER_Y + Math.sin(t * 1.3) * 0.08; decor.boat.rotation.z = Math.sin(t * 1.1) * 0.04;
      for (const s of decor.sails) { s.position.y = Math.sin(t * 0.9 + s.userData.ph) * 0.15; s.rotation.z = Math.sin(t * 0.8 + s.userData.ph) * 0.05; }
      if (decor.wreck.rag) decor.wreck.rag.rotation.y = Math.sin(t * 2) * 0.3;
      life.render(dt, t);
    },
  };

  /** Le prochain but (étincelles du mode Promenade, rayon d'aide, quête) : le plus proche des choses à faire. */
  function goalNow(me) {
    const b = beach(), goals = [];
    if (!b.talk.gino) goals.push(G.gino);
    if (!b.talk.mistral) goals.push(G.mistral);
    if (b.talk.mistral && !b.lesson && !st.race) goals.push(G.mistral);
    if (b.lesson && !b.raceWon && !st.race) goals.push(G.mistral);
    if (!b.talk.barnabe) goals.push(G.barnabe);
    if (!b.talk.perle) goals.push(G.perle);
    if (b.talk.barnabe && !b.chest) {
      if (b.pieces.length >= 3) goals.push(S.CHEST);
      else {
        if (!b.pieces.includes('p1')) goals.push(S.MAP_PIECES[0]);
        if (!b.pieces.includes('p2')) goals.push(S.PIECE_MOUND);
        if (!b.pieces.includes('p3')) goals.push(b.kingDrop ? { x: b.kingDrop[0], z: b.kingDrop[1] } : S.CRAB_KING);
      }
    }
    if (b.talk.perle && !b.light) {
      if (b.lenses.length >= 3) goals.push({ x: LH.x, y: LH.top, z: LH.z + 2 });
      else for (const l of S.LENSES) if (!b.lenses.includes(l.id)) goals.push(l);
    }
    if (b.seal !== 'home') {
      if (b.sealMet && !b.sardine) goals.push(G.gino);
      else if (b.talk.mistral || b.sardine) goals.push(st.seal);
    }
    if (game.cats.some(c => c.def.group === 'clearing' && !c.dead)) goals.push(S.FORT);
    for (const f of S.FORT_FLAGS) if (!b.flags.includes(f.id)) { goals.push(f); break; }
    for (const m of game.medals) if (m.mesh.visible) goals.push(m.def);
    if (!goals.length) for (const d of S.MOUNDS) if (!dug(d.id)) goals.push(d);
    let best = null, bd = Infinity;
    for (const g of goals) { const d = Math.hypot(g.x - me.pos.x, g.z - me.pos.z); if (d < bd) { bd = d; best = g; } }
    return best ? { x: best.x, y: best.y === undefined ? S.heightAt(best.x, best.z) : best.y, z: best.z } : null;
  }
  return logic;
}
