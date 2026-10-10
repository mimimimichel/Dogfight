/*
 * Matcha & Ainu — Niveau 2 « La Forêt des Moustaches » : décor et règles propres
 * au niveau (champignons, lanternes, patte géante, repaire et combat contre la
 * Capitaine Moustache). Le moteur commun est dans game.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as W from './world.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };

/** Croquette dorée (remplace l'os du niveau 1). */
export function kibbleGeometry() {
  const g = new THREE.TorusGeometry(0.2, 0.13, 10, 20);
  return g;
}

// ---------------------------------------------------------------------------
// Petits constructeurs de décor
// ---------------------------------------------------------------------------
function spotsTexture(base, spot) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = base; x.fillRect(0, 0, 256, 64);
  x.fillStyle = spot;
  let s = 7;
  const r = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) { x.beginPath(); x.ellipse(r() * 256, 6 + r() * 34, 5 + r() * 7, 4 + r() * 5, 0, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  return t;
}

/** Chapeau de champignon à dessus plat (on voit bien où se poser). */
function capGeometry(r) {
  const pts = [];
  pts.push(new THREE.Vector2(0.001, 0));
  pts.push(new THREE.Vector2(r * 0.8, 0));
  for (let i = 1; i <= 6; i++) { const a = (i / 6) * Math.PI / 2; pts.push(new THREE.Vector2(r * 0.8 + Math.sin(a) * r * 0.2, -(1 - Math.cos(a)) * r * 0.22)); }
  pts.push(new THREE.Vector2(r * 0.95, -r * 0.34));
  pts.push(new THREE.Vector2(r * 0.25, -r * 0.4));
  pts.push(new THREE.Vector2(0.001, -r * 0.4));
  const g = new THREE.LatheGeometry(pts.reverse(), 32);
  return g;
}

function stalkGeometry(rTop, rBot, h) {
  const g = new THREE.CylinderGeometry(rTop, rBot, h, 18, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), k = 1 + Math.sin(y * 1.3 + Math.atan2(p.getZ(i), p.getX(i)) * 3) * 0.04;
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function ringsTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e8c08a'; x.fillRect(0, 0, 128, 128);
  for (let r = 6; r < 64; r += 6 + (r % 4)) { x.strokeStyle = r % 12 ? '#c89a60' : '#b0844c'; x.lineWidth = 2; x.beginPath(); x.arc(64, 64, r, 0, 7); x.stroke(); }
  x.strokeStyle = '#8a5a30'; x.lineWidth = 6; x.beginPath(); x.arc(64, 64, 62, 0, 7); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function stripesTexture(a, b) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 8;
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * 16, 0, 16, 8); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

function glowSprite(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color, transparent: true, opacity: opacity === undefined ? 0.7 : opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1);
  return s;
}

const shadowy = (o) => { o.traverse(k => { if (k.isMesh) { k.castShadow = true; k.receiveShadow = true; } }); return o; };

// ---------------------------------------------------------------------------
// La Capitaine Moustache : grand chat gris, bicorne, cache-œil et grosse moustache
// ---------------------------------------------------------------------------
function buildCaptain() {
  const cat = M.buildCat();
  const u = cat.userData;
  const hatMat = M.mat(0x23202c, { roughness: 0.6 });
  const gold = M.mat(0xffc830, { metalness: 0.8, roughness: 0.3 });
  const hat = new THREE.Group();
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.08, 28, 1, false, 0, Math.PI), hatMat);
  brim.rotation.set(Math.PI / 2, 0, Math.PI / 2); brim.scale.set(1, 1, 0.45);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.42, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), hatMat);
  crown.scale.set(1.25, 0.9, 0.7);
  const badge = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), gold);
  badge.position.set(0, 0.18, 0.28);
  const feather = new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 8), M.mat(0xe04a6a, { roughness: 0.7 }));
  feather.scale.set(0.25, 0.9, 0.12); feather.position.set(-0.32, 0.42, -0.05); feather.rotation.z = 0.5;
  hat.add(brim, crown, badge, feather);
  hat.position.set(0, 0.32, -0.02);
  u.head.add(hat);
  // moustache en guidon
  const mus = M.mat(0x2a2430, { roughness: 0.8 });
  for (const sx of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.08, 0.42), new THREE.Vector3(sx * 0.18, -0.1, 0.42), new THREE.Vector3(sx * 0.34, -0.02, 0.36), new THREE.Vector3(sx * 0.36, 0.08, 0.32),
    ]);
    const m = new THREE.Mesh(new THREE.TubeGeometry(curve, 16, 0.045, 8), mus);
    u.head.add(m);
  }
  // cache-œil
  const patch = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), M.mat(0x111111, { roughness: 0.9 }));
  patch.position.set(0.15, 0.07, 0.425); patch.rotation.y = 0.35; u.head.add(patch);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.015, 6, 30), M.mat(0x111111));
  strap.rotation.set(0, Math.PI / 2, 0.5); strap.position.y = 0.07; u.head.add(strap);
  cat.scale.setScalar(2.1);
  // étoiles quand elle est étourdie
  const stars = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const s = new THREE.Mesh(new THREE.OctahedronGeometry(0.1, 0), M.mat(0xffe040, { emissive: 0xffc000, emissiveIntensity: 0.8 }));
    s.userData.noOutline = true;
    stars.add(s);
  }
  stars.position.y = 1.45; stars.visible = false;
  cat.add(stars);
  u.stars = stars;
  return cat;
}

function buildYarn() {
  const g = new THREE.Group();
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.45, 18, 14), M.mat(0xff6ab0, { roughness: 0.9 }));
  g.add(ball);
  const thread = M.mat(0xd8407e, { roughness: 0.9 });
  for (let i = 0; i < 3; i++) {
    const r = new THREE.Mesh(new THREE.TorusGeometry(0.44, 0.035, 6, 28), thread);
    r.rotation.set(i * 1.1, i * 0.7, 0);
    g.add(r);
  }
  return g;
}

// ===========================================================================
export function buildForest(game) {
  const sc = game.scene;
  const lite = game.lite;
  const S = L; // données du niveau 2
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();
  const moving = [];
  const chars = [];

  // --- Tour des Champignons ---------------------------------------------------
  const stalkMat = M.mat(0xf2e6cc, { roughness: 0.8 });
  const TW = S.TOWER;
  const stalk = new THREE.Mesh(stalkGeometry(TW.stalkR * 0.85, TW.stalkR * 1.25, S.TOWER_TOP - TW.base + 1.5), stalkMat);
  stalk.position.set(TW.x, TW.base - 1.5 + (S.TOWER_TOP - TW.base + 1.5) / 2, TW.z);
  sc.add(shadowy(stalk));
  const capCols = [['#e0453a', '#fff4e8'], ['#f08a2a', '#fff2cc'], ['#a066e0', '#f4e8ff'], ['#e85a9a', '#fff0f6']];
  const capMats = capCols.map(([a, b]) => new THREE.MeshStandardMaterial({ map: spotsTexture(a, b), roughness: 0.6 }));
  const underMat = M.mat(0xf6e2c0, { roughness: 0.9 });
  const addCap = (x, top, z, r, matI) => {
    const g = capGeometry(r);
    const m = new THREE.Mesh(g, capMats[matI % capMats.length]);
    m.position.set(x, top, z);
    sc.add(shadowy(m));
    const under = new THREE.Mesh(new THREE.CircleGeometry(r * 0.93, 28), underMat);
    under.rotation.x = Math.PI / 2; under.position.set(x, top - r * 0.38, z);
    sc.add(under);
    return m;
  };
  S.towerCaps.forEach((c, i) => {
    addCap(c.x, c.top, c.z, c.r * 1.08, i);
    // petit pied qui relie le chapeau au grand pied
    const len = 3.2;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.42, len, 10), stalkMat);
    arm.position.set((c.x + TW.x) / 2, c.top - 0.9, (c.z + TW.z) / 2);
    arm.rotation.set(0, -c.a, 0); arm.rotateZ(Math.PI / 2 + 0.45);
    sc.add(shadowy(arm));
  });
  addCap(TW.x, S.TOWER_TOP, TW.z, S.TOWER_TOP_R + 0.2, 0);

  // --- Champignons rebondissants ---------------------------------------------
  const bounceMat = new THREE.MeshStandardMaterial({ map: spotsTexture('#ff5ab8', '#ffe8f6'), roughness: 0.5, emissive: 0x401030, emissiveIntensity: 0.3 });
  const bouncers = S.bouncers.map((b) => {
    const g = new THREE.Group();
    const h = b.top - b.base;
    const st = new THREE.Mesh(stalkGeometry(b.r * 0.35, b.r * 0.5, h + 0.4), stalkMat);
    st.position.y = (h + 0.4) / 2 - 0.4;
    const cap = new THREE.Mesh(capGeometry(b.r * 1.12), bounceMat);
    cap.position.y = h;
    g.add(st, cap);
    g.position.set(b.x, b.base, b.z);
    sc.add(shadowy(g));
    return { def: b, g, cap, h };
  });

  // --- Souche-tremplin -------------------------------------------------------
  {
    const ST = S.STUMP, h = ST.top - ST.base + 1;
    const bark = M.mat(0x7a5030, { roughness: 0.95 });
    const trunk = new THREE.Mesh(stalkGeometry(ST.r, ST.r * 1.2, h), bark);
    trunk.position.set(ST.x, ST.base - 1 + h / 2, ST.z);
    sc.add(shadowy(trunk));
    const top = new THREE.Mesh(new THREE.CircleGeometry(ST.r * 0.98, 32), new THREE.MeshStandardMaterial({ map: ringsTexture(), roughness: 0.9 }));
    top.rotation.x = -Math.PI / 2; top.position.set(ST.x, ST.top + 0.02, ST.z);
    sc.add(top);
    for (let i = 0; i < 5; i++) {
      const a = i * 1.26 + 0.4;
      const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2, 4, 10), bark);
      root.position.set(ST.x + Math.cos(a) * 2.5, ST.base + 0.2, ST.z + Math.sin(a) * 2.5);
      root.rotation.set(0, -a, 0); root.rotateZ(Math.PI / 2 - 0.4);
      sc.add(shadowy(root));
    }
    // petite plate-forme d'envol avec un drapeau
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 8), M.mat(0xf4f4f4));
    pole.position.set(ST.x - 1.4, ST.top + 1.1, ST.z - 1); sc.add(pole);
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.6), M.mat(0x3a9ae0, { side: THREE.DoubleSide }));
    flag.position.set(ST.x - 0.9, ST.top + 1.9, ST.z - 1); sc.add(flag);
  }

  // --- Rocher du Hibou : statue de hibou et buissons ---------------------------
  {
    const O = S.OWL;
    const stone = W.stoneMat();
    const owl = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 16), M.mat(0xb8ae9e, { roughness: 0.9 }));
    body.scale.set(1, 1.25, 0.9); body.position.y = 1.1;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.7, 20, 16), body.material);
    head.position.y = 2.3;
    owl.add(body, head);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.24, 14, 10), M.mat(0xffd040, { emissive: 0xffa000, emissiveIntensity: 0.6 }));
      eye.position.set(sx * 0.27, 2.38, 0.55); owl.add(eye);
      const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), M.mat(0x111111));
      pupil.position.set(sx * 0.29, 2.38, 0.75); owl.add(pupil);
      const ear = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 8), body.material);
      ear.position.set(sx * 0.4, 2.95, 0); ear.rotation.z = -sx * 0.4; owl.add(ear);
    }
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 8), M.mat(0xe0902a));
    beak.position.set(0, 2.15, 0.68); beak.rotation.x = Math.PI / 2 + 0.3; owl.add(beak);
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 0.5, 16), stone);
    base.position.y = 0.25; owl.add(base);
    owl.position.set(O.x - 2.6, O.top, O.z - 1.8);
    owl.rotation.y = Math.atan2(S.STUMP.x - O.x, S.STUMP.z - O.z);
    sc.add(shadowy(owl));
    void stone;
  }

  // --- Patte géante (interrupteur) et feuilles magiques -----------------------
  const SW = S.SWITCH;
  const pawMat = new THREE.MeshStandardMaterial({ color: 0x6ad84a, emissive: 0x2a8a1a, emissiveIntensity: 0.4, roughness: 0.5 });
  const pawPlate = new THREE.Group();
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(SW.r, SW.r * 1.1, 0.3, 28), M.mat(0x8a6a4a, { roughness: 0.9 }));
  plate.position.y = 0.1;
  pawPlate.add(plate);
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.12, 20), pawMat);
  pad.position.set(0, 0.28, 0.15); pad.scale.set(1.1, 1, 0.9); pawPlate.add(pad);
  for (const [tx, tz] of [[-0.55, -0.35], [-0.2, -0.65], [0.2, -0.65], [0.55, -0.35]]) {
    const toe = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 14), pawMat);
    toe.position.set(tx, 0.28, tz); pawPlate.add(toe);
  }
  pawPlate.position.set(SW.x, SW.y, SW.z);
  sc.add(shadowy(pawPlate));
  const pawGlow = glowSprite(0x8aff6a, 3.5, 0.0);
  pawGlow.position.set(SW.x, SW.y + 0.6, SW.z); sc.add(pawGlow);

  const leafMat = new THREE.MeshStandardMaterial({ color: 0x5ad040, emissive: 0x1a6a10, emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 1 });
  const leafGeo = (() => {
    const sh = new THREE.Shape();
    sh.moveTo(0, -1.9);
    sh.bezierCurveTo(1.5, -1.2, 1.7, 0.8, 0, 1.9);
    sh.bezierCurveTo(-1.7, 0.8, -1.5, -1.2, 0, -1.9);
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.18, bevelEnabled: true, bevelSize: 0.06, bevelThickness: 0.06, bevelSegments: 2 });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -0.24, 0);
    return g;
  })();
  const veinMat = M.mat(0x3a9a2a);
  const leaves = S.leaves.map((l, i) => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(leafGeo, leafMat);
    const vein = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.05, 3.4), veinMat); vein.position.y = 0.02;
    g.add(m, vein);
    g.position.set(l.x, l.top, l.z);
    g.rotation.y = 0.9 + i * 0.4;
    g.scale.setScalar(0.001);
    g.visible = false;
    sc.add(shadowy(g));
    moving.push(g);
    return { def: l, g, k: 0 };
  });

  // --- Campement des chats ---------------------------------------------------
  const tentMat = new THREE.MeshStandardMaterial({ map: stripesTexture('#d83a3a', '#f6efe0'), roughness: 0.8 });
  for (const t of S.tents) {
    const tent = new THREE.Mesh(new THREE.ConeGeometry(2, 2.6, 6, 1, true), tentMat);
    tent.material.side = THREE.DoubleSide;
    tent.position.set(t.x, t.y + 1.3, t.z); tent.rotation.y = t.rot;
    sc.add(shadowy(tent));
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.55, 3), M.mat(0x2a1608));
    door.position.set(t.x + Math.sin(t.rot) * 1.55, t.y + 0.45, t.z + Math.cos(t.rot) * 1.55);
    door.rotation.y = t.rot; door.rotation.z = Math.PI / 2;
    sc.add(door);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.mat(0xffc830, { metalness: 0.6, roughness: 0.3 }));
    tip.position.set(t.x, t.y + 2.65, t.z); sc.add(tip);
  }
  const CF = S.CAMPFIRE;
  const fire = new THREE.Group();
  const logMat = M.mat(0x6a4024, { roughness: 0.95 });
  for (let i = 0; i < 4; i++) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 1.6, 8), logMat);
    log.rotation.set(Math.PI / 2 - 0.35, i * Math.PI / 2, 0); log.position.y = 0.3;
    fire.add(log);
  }
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const st = new THREE.Mesh(new THREE.DodecahedronGeometry(0.28, 0), M.mat(0x8a847a, { roughness: 0.9 }));
    st.position.set(Math.cos(a) * 1.05, 0.12, Math.sin(a) * 1.05); fire.add(st);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffa020, transparent: true, opacity: 0.9 });
  const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffe060, transparent: true, opacity: 0.95 });
  const flames = [];
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.35 - i * 0.08, 1.1 - i * 0.2, 8), i ? flameMat2 : flameMat);
    f.position.set((i - 1) * 0.15, 0.85, (i % 2) * 0.12); f.userData.noOutline = true;
    fire.add(f); flames.push(f);
  }
  const fireGlow = glowSprite(0xff9a30, 5, 0.6);
  fireGlow.position.y = 1.1; fire.add(fireGlow);
  fire.position.set(CF.x, CF.y, CF.z);
  sc.add(fire);
  // drapeau des pirates-chats
  {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 5, 8), M.mat(0x6a4024));
    pole.position.set(CF.x + 3.5, CF.y + 2.5, CF.z - 8.5); sc.add(shadowy(pole));
    const c = document.createElement('canvas'); c.width = 128; c.height = 80;
    const x = c.getContext('2d');
    x.fillStyle = '#20202a'; x.fillRect(0, 0, 128, 80);
    x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 38, 18, 0, 7); x.fill();
    x.beginPath(); x.moveTo(48, 26); x.lineTo(44, 8); x.lineTo(58, 22); x.fill();
    x.beginPath(); x.moveTo(80, 26); x.lineTo(84, 8); x.lineTo(70, 22); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 4;
    x.beginPath(); x.moveTo(30, 50); x.quadraticCurveTo(64, 70, 98, 50); x.stroke();
    x.fillStyle = '#20202a'; x.beginPath(); x.arc(57, 36, 4, 0, 7); x.arc(71, 36, 4, 0, 7); x.fill();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(2, 1.25), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 }));
    flag.position.set(CF.x + 4.5, CF.y + 4.3, CF.z - 8.5);
    sc.add(flag);
  }

  // --- Arbres géants -----------------------------------------------------------
  {
    const bark = M.mat(0x6a4428, { roughness: 0.95 });
    const blobGeo = W.leafClusterGeo(lite ? 10 : 16);
    const blobs = [];
    for (const g of S.giants) {
      const h = 16 * g.s + 1;
      const trunk = new THREE.Mesh(stalkGeometry(1.1 * g.s, 1.8 * g.s, h), bark);
      trunk.position.set(g.x, g.y - 1 + h / 2, g.z);
      sc.add(shadowy(trunk));
      for (let i = 0; i < 5; i++) {
        const a = i * 1.26 + g.x;
        const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.4 * g.s, 1.8 * g.s, 4, 8), bark);
        root.position.set(g.x + Math.cos(a) * 1.9 * g.s, g.y + 0.15, g.z + Math.sin(a) * 1.9 * g.s);
        root.rotation.set(0, -a, 0); root.rotateZ(Math.PI / 2 - 0.4);
        sc.add(shadowy(root));
      }
      const top = g.y + 15 * g.s;
      blobs.push([g.x, top + 1.5 * g.s, g.z, 4.2 * g.s]);
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2 + g.z;
        blobs.push([g.x + Math.cos(a) * 4 * g.s, top - 0.5 + (i % 2) * 1.2, g.z + Math.sin(a) * 4 * g.s, 3 * g.s]);
      }
    }
    const inst = new THREE.InstancedMesh(blobGeo, W.leafMaterial(), blobs.length);
    inst.customDepthMaterial = W.leafDepthMaterial();
    const c = new THREE.Color();
    const cols = S.PALETTE.leaves;
    blobs.forEach(([x, y, z, s], i) => {
      m4.compose(v.set(x, y, z), q.setFromEuler(e.set(i, i * 1.7, 0)), sv.set(s, s * 0.8, s));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, c.set(cols[(i * 3) % cols.length]));
    });
    inst.castShadow = inst.receiveShadow = true;
    sc.add(inst);
  }

  // --- Repaire : rochers, porte, bannière ----------------------------------------
  {
    const rm = W.rockMat();
    S.arenaRocks.forEach((r, i) => {
      const m = new THREE.Mesh(W.rockGeometry(300 + i, 1.55, r.h / 2 + 0.6, 1.55), rm);
      m.position.set(r.x, r.y + r.h / 2 - 0.5, r.z);
      sc.add(shadowy(m));
    });
  }
  const G = S.GATE;
  const woodMap = M.buildCrate().material.map;
  const plankMat = M.mat(0xb07840, { roughness: 0.85 }).clone();
  if (woodMap) { plankMat.map = woodMap; plankMat.color.set(0xd8a070); }
  const gate = new THREE.Group();
  for (let i = 0; i < 5; i++) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.62, 3.6, 0.35), plankMat);
    p.position.set((i - 2) * 0.66, 1.8, 0);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.5, 4), plankMat);
    tip.position.set((i - 2) * 0.66, 3.85, 0); tip.rotation.y = Math.PI / 4;
    gate.add(p, tip);
  }
  const bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 0.2), M.mat(0x5a3a20));
  bar.position.set(0, 2.4, 0.25); gate.add(bar);
  gate.position.set(G.x, S.ARENA.y, G.z);
  sc.add(shadowy(gate));
  moving.push(gate);
  // panneau « Repaire » au-dessus de l'entrée
  {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = '#5a3a20'; x.fillRect(0, 0, 256, 64);
    x.fillStyle = '#ffd860'; x.font = 'bold 30px Fredoka, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText('REPAIRE', 128, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.9, 0.15), [plankMat, plankMat, plankMat, plankMat, new THREE.MeshStandardMaterial({ map: t }), plankMat]);
    board.position.set(G.x, S.ARENA.y + 5.2, G.z + 0.3);
    sc.add(board);
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 5.6, 8), plankMat);
      post.position.set(G.x + sx * 2.1, S.ARENA.y + 2.8, G.z + 0.3); sc.add(shadowy(post));
    }
  }

  // --- Lanternes ---------------------------------------------------------------
  const lanterns = S.lanterns.map((l) => {
    const g = new THREE.Group();
    const postH = 1.6;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, postH, 8), M.mat(0x4a3420, { roughness: 0.9 }));
    post.position.y = postH / 2; g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.08), post.material);
    arm.position.set(0.25, postH - 0.05, 0); g.add(arm);
    const glass = new THREE.MeshStandardMaterial({ color: 0x5a5040, emissive: 0xffc040, emissiveIntensity: 0, roughness: 0.3 });
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 6), glass);
    lamp.position.set(0.5, postH - 0.4, 0); g.add(lamp);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.25, 6), M.mat(0x2a2a30));
    roof.position.set(0.5, postH - 0.05, 0); g.add(roof);
    const glow = glowSprite(0xffc860, 3.2, 0);
    glow.position.set(0.5, postH - 0.4, 0); g.add(glow);
    g.position.set(l.x, l.y, l.z);
    g.rotation.y = l.x * 0.7;
    sc.add(shadowy(g));
    return { def: l, g, glass, glow, lit: false, litT: -9 };
  });

  // --- Autel des lucioles ----------------------------------------------------------
  const ALT = S.SPOTS.altar, altY = S.heightAt(ALT.x, ALT.z);
  const altar = new THREE.Group();
  const stoneM = W.stoneMat();
  const base1 = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.5, 0.5, 24), stoneM); base1.position.y = 0.25;
  const base2 = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.5, 0.9, 20), stoneM); base2.position.y = 0.9;
  const runeMat = new THREE.MeshStandardMaterial({ color: 0x80fff0, emissive: 0x40e0d0, emissiveIntensity: 0.2, roughness: 0.4 });
  const rune = new THREE.Mesh(new THREE.TorusGeometry(1.75, 0.07, 6, 40), runeMat); rune.rotation.x = Math.PI / 2; rune.position.y = 0.52;
  altar.add(base1, base2, rune);
  const altarGlow = glowSprite(0x80fff0, 6, 0.1); altarGlow.position.y = 1.6; altar.add(altarGlow);
  altar.position.set(ALT.x, altY, ALT.z);
  sc.add(shadowy(altar));

  // --- Lucioles ----------------------------------------------------------------
  const NF = lite ? 70 : 140;
  const fpos = new Float32Array(NF * 3), fbase = [];
  for (let i = 0; i < NF; i++) {
    const a = Math.random() * Math.PI * 2, d = 6 + Math.random() * 54;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    fbase.push([x, Math.max(0.5, S.heightAt(x, z)) + 0.8 + Math.random() * 2.5, z, Math.random() * 10]);
  }
  const fgeo = new THREE.BufferGeometry();
  fgeo.setAttribute('position', new THREE.BufferAttribute(fpos, 3));
  const flies = new THREE.Points(fgeo, new THREE.PointsMaterial({ map: M.glowTexture(), color: 0xfff27a, size: 0.55, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
  flies.frustumCulled = false;
  sc.add(flies);

  // --- Capitaine Moustache et pelotes ------------------------------------------------
  const AR = S.ARENA;
  const cap = buildCaptain();
  cap.position.set(AR.x, AR.y, AR.z - 3);
  sc.add(cap);
  chars.push(cap);
  moving.push(cap);
  const yarnMeshes = [];
  for (let i = 0; i < 6; i++) { const y = buildYarn(); y.visible = false; sc.add(y); yarnMeshes.push(y); moving.push(y); }
  const bossShadow = game.makeShadow(1.2);

  // =============================================================================
  // État et règles
  // =============================================================================
  const st = {
    leafUntil: -1, leafWarned: false, gateOpen: false, gateK: 0, gateHintT: -9,
    boss: { phase: 'idle', x: AR.x, y: AR.y, z: AR.z - 3, yaw: 0, hp: 3, t: 0, throws: 0, inv: 0, hop: null, anim: 0 },
    yarns: [],
  };
  const save = () => game.save;
  const near = (x, z) => game.nearestPlayer({ x, z });
  const leafCols = S.leaves.map(l => l.col);

  function refreshLanterns() {
    for (const l of lanterns) {
      const lit = save().lanterns.includes(l.def.id);
      if (lit && !l.lit) l.litT = game.t;
      l.lit = lit;
      l.glass.emissiveIntensity = lit ? 1.4 : 0;
      l.glass.color.set(lit ? 0xffe8a0 : 0x5a5040);
      l.glow.material.opacity = lit ? 0.75 : 0;
    }
    const n = save().lanterns.length;
    runeMat.emissiveIntensity = 0.2 + n * 0.25;
    altarGlow.material.opacity = 0.1 + n * 0.12;
  }

  function lightLantern(l) {
    const s = save();
    s.lanterns.push(l.def.id);
    game.persist();
    game.sound('lantern');
    game.burst(l.def.x, l.def.y + 1.3, l.def.z, 16, 0xffe070, 3, 0.7);
    refreshLanterns();
    if (s.lanterns.length >= S.lanterns.length) {
      game.updateMedalVisibility();
      game.banner('Les lucioles s\'illuminent !', 'Une médaille brille sur l\'autel, au centre de la forêt !', 3200);
      game.sound('reveal');
    } else game.banner(`Lanterne ${s.lanterns.length}/${S.lanterns.length}`, 'Encore un coup de queue tournoyant ailleurs !', 1600);
  }

  function setLeaves(on) {
    for (const c of leafCols) c.off = !on;
  }

  function openGate(silent) {
    st.gateOpen = true;
    S.GATE.off = true;
    if (!silent) { game.banner('Le repaire est ouvert !', 'La Capitaine Moustache vous attend au nord…', 3000); game.sound('reveal'); }
  }

  // --- combat --------------------------------------------------------------------
  const B = st.boss;
  function bossReset() {
    Object.assign(B, { phase: 'idle', x: AR.x, z: AR.z - 3, y: AR.y, hp: 3, t: 0, throws: 0, inv: 0, hop: null });
    st.yarns.length = 0;
  }
  function throwYarn() {
    const p = near(B.x, B.z);
    const tx = p.pos.x + p.vel.x * 0.5, tz = p.pos.z + p.vel.z * 0.5;
    const dx = tx - B.x, dz = tz - B.z, d = Math.hypot(dx, dz) || 1;
    st.yarns.push({ x: B.x, y: B.y + 2.4, z: B.z, sx: B.x, sz: B.z, tx, tz, ty: AR.y + 0.45, t: 0, T: clamp(d / 11, 0.6, 1.2), roll: 0, dx: dx / d, dz: dz / d });
    game.sound('throw');
  }
  function stepBoss(dt) {
    const p = near(B.x, B.z);
    const dA = (q) => Math.hypot(q.pos.x - AR.x, q.pos.z - AR.z);
    const inArena = game.players.some(q => dA(q) < AR.r - 1);
    const far = game.players.every(q => dA(q) > AR.r + 8);
    B.inv = Math.max(0, B.inv - dt);
    B.anim += dt;
    if (B.phase === 'idle') {
      B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 3);
      if (inArena && st.gateOpen && !game.dialog) {
        B.phase = 'intro';
        game.say([
          { who: 'Capitaine Moustache', text: 'Miaou-ha-ha ! Ainu et Matcha… Vous m\'avez suivie jusqu\'ici ?' },
          { who: 'Capitaine Moustache', text: 'Goûtez donc à mes pelotes de laine !' },
          { who: 'Matcha', text: 'Ainu, évite ses pelotes ! Quand elle sera fatiguée, on attaque !' },
        ], () => { B.phase = 'throw'; B.t = 0.8; B.throws = 0; });
      }
      return;
    }
    if (B.phase === 'intro' || B.phase === 'gone') return;
    if (far && B.phase !== 'defeated') { bossReset(); return; }
    B.t -= dt;
    if (B.phase === 'throw') {
      B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 6);
      if (B.t <= 0) {
        throwYarn();
        B.throws++;
        const per = 2 + (B.hp < 2 ? 1 : 0);   // 2, 2 puis 3 pelotes
        B.t = B.throws >= per ? 0.9 : 1.5 - (3 - B.hp) * 0.1;
        if (B.throws >= per) { B.phase = 'wait'; }
      }
    } else if (B.phase === 'wait') {
      if (B.t <= 0) { B.phase = 'tired'; B.t = 4.5; game.banner('Elle est fatiguée !', 'Vite, une attaque !', 1500); }
    } else if (B.phase === 'tired') {
      if (B.t <= 0) { B.phase = 'throw'; B.t = 0.6; B.throws = 0; }
    } else if (B.phase === 'hop') {
      const h = B.hop;
      h.t += dt;
      const k = Math.min(1, h.t / h.T);
      B.x = h.x0 + (h.x1 - h.x0) * k; B.z = h.z0 + (h.z1 - h.z0) * k;
      B.y = AR.y + Math.sin(k * Math.PI) * 4;
      if (k >= 1) { B.y = AR.y; B.phase = 'throw'; B.t = 0.7; B.throws = 0; }
    } else if (B.phase === 'defeated') {
      const h = B.hop;
      h.t += dt;
      B.y = AR.y + h.t * 9 - h.t * h.t * 2.5;
      B.x += Math.sin(B.yaw + Math.PI) * dt * 6; B.z += Math.cos(B.yaw + Math.PI) * dt * 6;
      if (h.t > 3.2) { B.phase = 'gone'; }
    }
    // contact avec les chiens
    for (const q of game.players) {
      if (B.phase === 'defeated' || B.phase === 'gone' || B.phase === 'hop') break;
      const dx = q.pos.x - B.x, dz = q.pos.z - B.z, d = Math.hypot(dx, dz), dy = q.pos.y - B.y;
      if (d < 2.3 && dy > -1 && dy < 3) {
        const attacking = q.attackT > 0 || q.dashT > 0 || (q.vel.y < -1 && dy > 1.2);
        if (B.phase === 'tired' && attacking && B.inv <= 0) hitBoss(q);
        else if (B.phase !== 'tired') game.hurtPlayer({ x: B.x, z: B.z }, q);
      }
    }
  }
  function hitBoss(q) {
    B.hp--; B.inv = 1;
    game.sound('bossHit');
    game.burst(B.x, B.y + 1.8, B.z, 22, 0xffffff, 5, 0.7);
    if (q.vel.y < 0) q.vel.y = 10;
    if (B.hp <= 0) {
      B.phase = 'defeated'; B.hop = { t: 0 };
      st.yarns.length = 0;
      game.say([
        { who: 'Capitaine Moustache', text: 'Grrr ! Vous m\'avez eue, sales cabots !' },
        { who: 'Capitaine Moustache', text: 'Gardez votre médaille… mais on se reverra ! Miaou !' },
      ], () => {
        save().boss = true;
        game.persist();
        game.updateMedalVisibility();
        game.banner('La Capitaine Moustache s\'enfuit !', 'Une Médaille Patoune est tombée dans le repaire !', 3000);
        game.sound('reveal');
      });
      return;
    }
    game.banner(B.hp === 2 ? 'Bien joué !' : 'Encore une fois !', `Il reste ${B.hp} coup${B.hp > 1 ? 's' : ''}`, 1400);
    // un cœur tombe dans l'arène si le duo en a perdu
    if (game.players.some(o => o.hearts < 3)) game.spawnHeart(AR.x + (Math.random() - 0.5) * 6, AR.y + 0.9, AR.z + (Math.random() - 0.5) * 6);
    // saute ailleurs dans l'arène
    const a = Math.random() * Math.PI * 2, r = 3 + Math.random() * 3.5;
    B.phase = 'hop'; B.hop = { t: 0, T: 0.9, x0: B.x, z0: B.z, x1: AR.x + Math.cos(a) * r, z1: AR.z + Math.sin(a) * r };
  }
  function stepYarns(dt) {
    for (const y of st.yarns) {
      if (y.t < y.T) {
        y.t += dt;
        const k = Math.min(1, y.t / y.T);
        y.x = y.sx + (y.tx - y.sx) * k; y.z = y.sz + (y.tz - y.sz) * k;
        y.y = (B.y + 2.4) * (1 - k) + y.ty * k + Math.sin(k * Math.PI) * 3;
        if (k >= 1) game.burst(y.x, y.ty, y.z, 6, 0xff9ad0, 2, 0.3);
      } else {
        y.roll += dt;
        y.x += y.dx * dt * 4.5; y.z += y.dz * dt * 4.5; y.y = y.ty;
      }
      for (const p of game.players) {
        const d = Math.hypot(p.pos.x - y.x, p.pos.z - y.z), dy = p.pos.y + 0.6 - y.y;
        if (d < 1.15 && Math.abs(dy) < 1.3 && y.t > y.T * 0.5) { game.hurtPlayer({ x: y.x, z: y.z }, p); y.roll = 99; break; }
      }
    }
    st.yarns = st.yarns.filter(y => y.roll < 1.1 && Math.hypot(y.x - AR.x, y.z - AR.z) < AR.r + 1);
  }

  // =============================================================================
  const logic = {
    moving, chars,
    step(dt) {
      const s = save(), t = game.t;
      const players = game.players;
      // lanternes : coup de queue tournoyant à côté
      for (const p of players) {
        if (p.attackT <= 0) continue;
        for (const l of lanterns) {
          if (l.lit) continue;
          const d = Math.hypot(l.def.x - p.pos.x, l.def.z - p.pos.z);
          if (d < 2.8 && Math.abs(l.def.y - p.pos.y) < 2.2) lightLantern(l);
        }
      }
      // patte géante
      if (players.some(p => p.grounded && p.onCol && p.onCol.kind === 'switch') && t > st.leafUntil - LEAF_REARM) {
        const first = st.leafUntil < 0;
        st.leafUntil = t + S.LEAF_TIME; st.leafWarned = false;
        setLeaves(true);
        game.sound('switch');
        game.burst(S.SWITCH.x, S.SWITCH.y + 0.5, S.SWITCH.z, 14, 0x8aff6a, 3, 0.6);
        if (first) game.banner('Des feuilles magiques !', 'Elles poussent sur le lac… mais pas pour longtemps !', 2600);
      }
      if (st.leafUntil > 0 && t > st.leafUntil) { setLeaves(false); st.leafUntil = 0; }
      // porte du repaire
      if (!st.gateOpen && s.medals.length >= S.GATE_MEDALS) openGate(false);
      if (!st.gateOpen && players.some(p => Math.hypot(p.pos.x - S.GATE.x, p.pos.z - S.GATE.z) < 3.2) && t - st.gateHintT > 6) {
        st.gateHintT = t;
        game.banner('La porte est fermée', `Il faut ${S.GATE_MEDALS} médailles pour entrer (tu en as ${s.medals.length})`, 2400);
      }
      // combat
      if (!s.boss) { stepBoss(dt); stepYarns(dt); }
    },
    reveal() {
      const s = save();
      return {
        m_mush: true,
        m_cats: S.cats.filter(c => c.group === 'clearing').every(c => s.cats.includes(c.id)),
        m_lanterns: s.lanterns.length >= S.lanterns.length,
        m_owl: true,
        m_boss: !!s.boss,
      };
    },
    applySave() { refreshLanterns(); if (save().boss) B.phase = 'gone'; },
    /** Après une chute de cœurs pendant le combat, on repart devant la porte du repaire. */
    respawn() {
      if (B.phase === 'idle' || B.phase === 'gone') return null;
      bossReset();
      return { x: S.GATE.x, y: S.heightAt(S.GATE.x, S.GATE.z + 4), z: S.GATE.z + 4 };
    },
    snapshot() {
      const r = (x) => Math.round(x * 100) / 100;
      return {
        l: st.leafUntil > 0 ? r(st.leafUntil - game.t) : 0,
        g: st.gateOpen ? 1 : 0,
        b: [B.phase, r(B.x), r(B.y), r(B.z), r(B.yaw), B.hp],
        y: st.yarns.map(y => [r(y.x), r(y.y), r(y.z)]),
      };
    },
    apply(x) {
      st.leafUntil = x.l > 0 ? game.t + x.l : 0;
      setLeaves(x.l > 0);
      if (x.g && !st.gateOpen) openGate(true);
      const [ph, bx, by, bz, yaw, hp] = x.b;
      B.phase = ph; B.hp = hp; B.yaw = yaw;
      B.x += (bx - B.x) * 0.5; B.y += (by - B.y) * 0.5; B.z += (bz - B.z) * 0.5;
      st.yarns = x.y.map(([a, b, c]) => ({ x: a, y: b, z: c }));
    },
    talkMamie(first) {
      const s = save();
      const k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Nous y voilà : la Forêt des Moustaches ! C\'est ici que la Capitaine s\'est cachée.' },
          { who: 'Biscotte', text: 'Ouaf ! J\'ai voulu venir aussi !' },
          { who: 'Mamie Labrador', text: 'Son repaire est tout au nord, mais la porte ne s\'ouvre qu\'avec 4 Médailles Patounes.' },
          { who: 'Mamie Labrador', text: 'Les champignons roses font rebondir très haut. Essayez celui près du chemin !' },
          { who: 'Mamie Labrador', text: `Les lanternes de la forêt sont éteintes : allumez-les avec un coup de queue (${k.attack}).` },
          { who: 'Ainu', text: 'Ouaf ! On y va, Matcha !' },
          { who: 'Matcha', text: 'Ramassez les croquettes dorées au passage !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Trouvez 4 médailles pour ouvrir le repaire !', 2800); game.updateHud(); });
        return;
      }
      if (s.medals.length >= 5) { game.say([{ who: 'Mamie Labrador', text: 'Bravo, mes toutous ! La forêt est libérée. Il reste peut-être des croquettes à trouver…' }]); return; }
      const hints = {
        m_mush: 'La Tour des Champignons, à l\'ouest : grimpez de chapeau en chapeau jusqu\'en haut !',
        m_cats: 'Les chats bandits ont un campement à l\'est. Chassez-les tous !',
        m_lanterns: `Il reste des lanternes éteintes (${s.lanterns.length}/5). Une est en haut de la Tour des Champignons, une autre sur un rocher près de la plage.`,
        m_owl: 'Le Rocher du Hibou, au milieu du lac : planez depuis la grande souche, ou sautez sur la patte géante !',
        m_boss: s.medals.length >= S.GATE_MEDALS ? 'Le repaire est ouvert, au nord. Évitez les pelotes et attaquez quand elle est fatiguée !' : null,
      };
      const left = S.medals.filter(m => !s.medals.includes(m.id)).map(m => hints[m.id]).filter(Boolean);
      game.say([{ who: 'Mamie Labrador', text: `Vous avez ${s.medals.length} médaille${s.medals.length > 1 ? 's' : ''} sur 5.` }, ...left.slice(0, 2).map(t => ({ who: 'Mamie Labrador', text: t }))]);
    },
    endLines() {
      return [
        { who: 'Mamie Labrador', text: 'Les 5 Médailles de la forêt ! La Capitaine Moustache a pris la fuite !' },
        { who: 'Biscotte', text: 'Vous êtes les meilleurs !' },
        { who: 'Matcha', text: 'Elle n\'a qu\'à bien se tenir !' },
        { who: 'Ainu', text: 'Ouaf ! À la prochaine aventure !' },
      ];
    },
    render(dt, t) {
      // lucioles
      const n = save().lanterns.length;
      for (let i = 0; i < NF; i++) {
        const [x, y, z, ph] = fbase[i];
        fpos[i * 3] = x + Math.sin(t * 0.5 + ph) * 1.5;
        fpos[i * 3 + 1] = y + Math.sin(t * 1.3 + ph * 2) * 0.5;
        fpos[i * 3 + 2] = z + Math.cos(t * 0.4 + ph) * 1.5;
      }
      fgeo.attributes.position.needsUpdate = true;
      flies.material.opacity = 0.55 + Math.sin(t * 3) * 0.15 + n * 0.05;
      // feu de camp
      flames.forEach((f, i) => { const k = 1 + Math.sin(t * (9 + i * 3) + i) * 0.15; f.scale.set(k, 1 + Math.sin(t * 7 + i * 2) * 0.2, k); });
      fireGlow.material.opacity = 0.5 + Math.sin(t * 11) * 0.1;
      // champignons qui s'écrasent
      for (const b of bouncers) {
        const since = t - (b.def.col.squashT || -9);
        const k = since < 0.5 ? 1 - Math.sin(since / 0.5 * Math.PI) * 0.3 * (1 - since / 0.5) : 1;
        b.cap.scale.set(2 - k, k, 2 - k);
      }
      // feuilles magiques
      const left = st.leafUntil > 0 ? st.leafUntil - t : -1;
      for (const l of leaves) {
        const target = left > 0 ? 1 : 0;
        l.k += (target - l.k) * Math.min(1, dt * 6);
        l.g.visible = l.k > 0.02;
        const blink = left > 0 && left < 3 && Math.floor(t * 6) % 2 === 0;
        l.g.scale.setScalar(Math.max(0.001, l.k));
        leafMat.opacity = blink ? 0.45 : 1;
        l.g.position.y = l.def.top + Math.sin(t * 2 + l.def.x) * 0.03;
      }
      pawMat.emissiveIntensity = left > 0 ? 1.2 : 0.4 + Math.sin(t * 3) * 0.15;
      pawGlow.material.opacity = left > 0 ? 0.6 : 0.15 + Math.sin(t * 3) * 0.08;
      // lanternes qui s'allument
      for (const l of lanterns) if (l.lit) l.glow.material.opacity = 0.65 + Math.sin(t * 4 + l.def.x) * 0.1 + Math.max(0, 1 - (t - l.litT)) * 0.6;
      altar.rotation.y = 0;
      rune.rotation.z = t * 0.3;
      // porte qui s'enfonce
      st.gateK += ((st.gateOpen ? 1 : 0) - st.gateK) * Math.min(1, dt * 2);
      gate.position.y = S.ARENA.y - st.gateK * 4.2;
      gate.visible = st.gateK < 0.98;
      // Capitaine
      const gone = B.phase === 'gone' || save().boss && B.phase !== 'defeated';
      cap.visible = !gone && !(B.inv > 0 && Math.floor(t * 14) % 2 === 0);
      bossShadow.visible = cap.visible;
      if (cap.visible) {
        cap.position.set(B.x, B.y, B.z);
        cap.rotation.y = B.yaw;
        const u = cap.userData;
        const tired = B.phase === 'tired';
        u.stars.visible = tired;
        if (tired) { u.stars.children.forEach((s, i) => { const a = t * 4 + i * Math.PI / 2; s.position.set(Math.cos(a) * 0.45, Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.45); }); }
        u.head.rotation.z = tired ? Math.sin(t * 3) * 0.25 : 0;
        u.head.rotation.x = B.phase === 'throw' && B.t < 0.3 ? -0.3 : 0;
        u.tail.rotation.x = -0.3 + Math.sin(t * 5) * 0.3;
        const walk = B.phase === 'hop' || B.phase === 'defeated';
        u.legs.forEach((l, i) => { l.rotation.x = walk ? (i < 2 ? -0.8 : 0.8) : tired ? 0.5 : Math.sin(t * 2 + i) * 0.05; });
        cap.position.y = B.y - (tired ? 0.15 : 0);
        game.placeShadow(bossShadow, cap.position, 1.2);
      }
      // pelotes
      yarnMeshes.forEach((m, i) => {
        const y = st.yarns[i];
        m.visible = !!y && cap.visible !== undefined;
        if (y) { m.position.set(y.x, y.y, y.z); m.rotation.x += dt * 8; m.rotation.y += dt * 3; }
      });
    },
  };
  const LEAF_REARM = 3; // on peut relancer les feuilles quand il reste moins de 3 s

  // état initial d'après la sauvegarde
  refreshLanterns();
  if (game.save.medals.length >= S.GATE_MEDALS) openGate(true);
  if (game.save.boss) B.phase = 'gone';
  setLeaves(false);
  return logic;
}
