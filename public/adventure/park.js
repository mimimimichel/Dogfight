/*
 * Matcha & Ainu — Niveau 1 « Le Parc des Toutous » : décor et règles.
 * Le Grand Chêne, la niche de Mamie, la fontaine, le petit train, les pédalos-cygnes,
 * le manège, le kiosque, l'aire de jeux (toboggan, balançoires, bac à sable), le
 * terrain d'agility de Gaston, le labyrinthe fleuri, la cabane perchée, le belvédère
 * et sa longue-vue, les lanternes magiques, les indices de Biscotte, les drapeaux.
 * Le moteur commun est dans game.js ; les données dans level1.js ; les modèles dans parkkit.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as W from './world.js';
import * as RT from './realtex.js';
import * as K from './parkkit.js';
import { buildFlag } from './farmkit.js';
import { Cinema } from './cinema.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const angDiff = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const svg = (body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset=".55" stop-color="#ffcf3a"/><stop offset="1" stop-color="#e89a10"/></linearGradient></defs>${body}</svg>`);
const ICON_LANTERN = svg('<path d="M24 14h16l-2-6H26z" fill="#2a4a3a"/><rect x="20" y="14" width="24" height="32" rx="4" fill="url(#g)" stroke="#2a4a3a" stroke-width="4"/><path d="M32 22c4 5 4 10 0 14-4-4-4-9 0-14z" fill="#ff8a2a"/><rect x="18" y="46" width="28" height="6" rx="2" fill="#2a4a3a"/>');
const ICON_CAT = svg('<path d="M14 26 12 8l12 10h16l12-10-2 18c3 4 4 8 4 12 0 12-11 18-22 18S10 50 10 38c0-4 1-8 4-12z" fill="#8a8a9a" stroke="#3a3a4a" stroke-width="3"/><circle cx="24" cy="34" r="4" fill="#f0e060"/><circle cx="40" cy="34" r="4" fill="#f0e060"/><path d="M28 44h8l-4 4z" fill="#ff8aa0"/>');
const ICON_TIME = svg('<circle cx="32" cy="36" r="22" fill="#fff" stroke="#2a4a7a" stroke-width="4"/><rect x="27" y="6" width="10" height="7" rx="2" fill="#2a4a7a"/><path d="M32 36V22M32 36l9 6" stroke="#e0303a" stroke-width="4" stroke-linecap="round"/>');

/** Petits bruits du parc, joués au synthé du jeu. */
function parkSounds(game) {
  const go = (fn) => { const s = game.sfx; if (!s || !s.ok) return; try { fn(s); } catch (e) { /* pas de son */ } };
  return {
    quack: () => go((s) => { s.tone(620, 0.09, { type: 'sawtooth', to: 430, vol: 0.04 }); s.tone(600, 0.09, { type: 'sawtooth', to: 420, vol: 0.035, delay: 0.14 }); }),
    toot: () => go((s) => { s.tone(523, 0.35, { type: 'square', vol: 0.06 }); s.tone(659, 0.35, { type: 'square', vol: 0.05 }); s.tone(523, 0.5, { type: 'square', vol: 0.06, delay: 0.45 }); s.tone(659, 0.5, { type: 'square', vol: 0.05, delay: 0.45 }); }),
    chug: (k) => go((s) => { s.noise(0.08, { filter: 'bandpass', freq: 500 + k * 300, vol: 0.08 }); }),
    squeak: () => go((s) => { s.tone(1400, 0.08, { type: 'square', to: 1900, vol: 0.05 }); s.tone(1800, 0.1, { type: 'square', to: 1200, vol: 0.04, delay: 0.1 }); }),
    dig: () => go((s) => { s.noise(0.25, { filter: 'lowpass', freq: 900, freqTo: 300, vol: 0.3 }); s.noise(0.2, { filter: 'lowpass', freq: 800, freqTo: 200, vol: 0.25, delay: 0.25 }); }),
    whistle: (long) => go((s) => { s.tone(2200, long ? 0.6 : 0.18, { type: 'sine', to: 2350, vol: 0.06 }); }),
    beep: (hi) => go((s) => { s.tone(hi ? 1320 : 880, hi ? 0.4 : 0.15, { type: 'square', vol: 0.06 }); }),
    music: (i) => go((s) => { const tune = [72, 76, 79, 76, 77, 81, 79, 77, 76, 79, 84, 79, 77, 74, 72, 72]; s.note('mallet', tune[i % tune.length], 0.05); }),
    paddle: () => go((s) => { s.noise(0.12, { filter: 'bandpass', freq: 900, freqTo: 500, vol: 0.06 }); }),
    whoosh: () => go((s) => { s.noise(0.6, { filter: 'bandpass', freq: 600, freqTo: 2400, vol: 0.18 }); }),
  };
}

export function buildPark(game) {
  const sc = game.scene, lite = game.lite, real = game.realistic, S = L;
  const moving = [], chars = [];
  const snd = parkSounds(game);
  const save = () => game.save;
  const park = () => {
    const s = game.save;
    if (!s.park) s.park = {};
    const p = s.park;
    for (const [k, v] of [['clues', 0], ['lit', []], ['agility', false], ['best', 0], ['flags', [0]], ['metGaston', false]]) if (p[k] === undefined) p[k] = Array.isArray(v) ? v.slice() : v;
    return p;
  };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();
  const ZERO = new THREE.Vector3(0, 0, 0);
  const shadowy = (o) => { o.traverse(k => { if (k.isMesh) { k.castShadow = true; k.receiveShadow = true; } }); return o; };
  // grand monde : le décor fixe est rangé par tuiles (téléphone) ou objet par objet (ordinateur : contours en dessin animé),
  // et caché quand il est loin de la caméra
  const cull = [];
  const place = (obj, x, z, r) => { sc.add(obj); cull.push({ obj, x, z, r: r || 6 }); return obj; };
  const TILE = 48, packs = new Map();
  const VM = K.vmat(0.8);
  /** Pose une géométrie peinte (repère local) dans le décor. */
  const put = (geo, x, y, z, ry, s) => {
    if (lite) {
      const key = Math.floor(x / TILE) + ',' + Math.floor(z / TILE);
      if (!packs.has(key)) packs.set(key, new K.Pack());
      packs.get(key).put(geo, { x, y, z, ry: ry || 0, sx: s || 1 });
      return null;
    }
    const m = new THREE.Mesh(geo, VM);
    m.position.set(x, y, z); m.rotation.y = ry || 0; if (s) m.scale.setScalar(s);
    m.castShadow = m.receiveShadow = true;
    if (!geo.boundingSphere) geo.computeBoundingSphere();
    return place(m, x, z, geo.boundingSphere.radius * (s || 1) + 2);
  };
  const flushPacks = () => {
    for (const [key, p] of packs) {
      const [i, j] = key.split(',').map(Number);
      const mesh = new THREE.Mesh(p.geo(), VM);
      mesh.castShadow = mesh.receiveShadow = true;
      place(mesh, (i + 0.5) * TILE, (j + 0.5) * TILE, TILE * 0.75);
    }
    packs.clear();
  };
  const H = (x, z) => S.heightAt(x, z);

  // --- interface : compteurs lanternes / chats / chrono ---------------------------------
  const hud = {};
  {
    const box = game.dom.root.querySelector('.adv-counts');
    const chip = (icon, max) => {
      const d = document.createElement('div');
      d.className = 'adv-count hidden';
      d.innerHTML = `<img src="${icon}" alt=""><span>0</span>${max ? `<small>/${max}</small>` : '<small>s</small>'}`;
      if (box) box.appendChild(d);
      return d;
    };
    hud.lit = chip(ICON_LANTERN, S.LANTERNS.length);
    hud.cats = chip(ICON_CAT, S.cats.filter(c => c.group === 'clearing').length);
    hud.time = chip(ICON_TIME, 0);
  }
  const catsLeft = () => S.cats.filter(c => c.group === 'clearing' && !save().cats.includes(c.id)).length;
  function updateChips() {
    const p = park(), s = save(), on = s.intro;
    const set = (el, n) => { const sp = el.querySelector('span'); if (sp.textContent !== String(n)) { sp.textContent = n; el.classList.remove('bump'); void el.offsetWidth; el.classList.add('bump'); } };
    hud.lit.classList.toggle('hidden', !on || !p.lit.length || s.medals.includes('m_tree'));
    set(hud.lit, p.lit.length);
    const nCats = S.cats.filter(c => c.group === 'clearing').length;
    hud.cats.classList.toggle('hidden', !on || catsLeft() === nCats || s.medals.includes('m_cats'));
    set(hud.cats, nCats - catsLeft());
    hud.time.classList.toggle('hidden', !st.run);
    if (st.run) set(hud.time, Math.max(0, Math.floor(st.run.t)));
  }

  // =============================================================================
  // Décor
  // =============================================================================
  // --- Le Grand Chêne : tronc noueux, branches rondes en spirale, grand feuillage --------
  {
    const T = S.TREE;
    const barkPh = (rx, ry) => (W.LOOK.real && RT.hasPhotos() ? RT.photo('bark_willow_02', rx, ry) : null);
    const barkOf = (rx, ry) => { const ph = barkPh(rx, ry); return ph ? new THREE.MeshStandardMaterial({ map: ph.map, normalMap: ph.normalMap, color: new THREE.Color(1.45, 1.35, 1.25), roughness: 0.95 }) : M.mat(0x7a5030, { roughness: 0.95 }); };
    const bark = barkOf(5, 6), barkSmall = barkOf(1.2, 1);
    const ringsTex = (() => {
      if (!W.LOOK.real) return null;
      const c = document.createElement('canvas'); c.width = c.height = 256;
      const x = c.getContext('2d');
      x.fillStyle = '#b88a58'; x.fillRect(0, 0, 256, 256);
      for (let r = 124; r > 2; r -= 5 + (r % 3)) { x.strokeStyle = `rgba(110,70,35,${0.25 + (r % 7) * 0.04})`; x.lineWidth = 1.5 + (r % 4) * 0.5; x.beginPath(); x.ellipse(128 + Math.sin(r) * 2, 128, r, r * 0.97, 0, 0, Math.PI * 2); x.stroke(); }
      x.strokeStyle = '#6a4424'; x.lineWidth = 8; x.beginPath(); x.arc(128, 128, 124, 0, Math.PI * 2); x.stroke();
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
    })();
    const woodTop = ringsTex ? new THREE.MeshStandardMaterial({ map: ringsTex, normalMap: RT.normalFor(ringsTex, 3), roughness: 0.85 }) : null;
    const trunkGeo = new THREE.CylinderGeometry(T.trunkR * 0.9, T.trunkR * 1.25, T.height + 2.4, 24, 16);
    const tp = trunkGeo.attributes.position;
    for (let i = 0; i < tp.count; i++) {
      const x = tp.getX(i), y = tp.getY(i), z = tp.getZ(i), a = Math.atan2(z, x);
      const k = 1 + Math.sin(a * 7 + y * 0.6) * 0.05 + Math.sin(a * 3 - y * 0.3) * 0.04 + (y < -(T.height / 2) + 1 ? 0.25 : 0);
      tp.setX(i, x * k); tp.setZ(i, z * k);
    }
    trunkGeo.computeVertexNormals();
    const oak = new THREE.Group();
    const trunk = new THREE.Mesh(trunkGeo, bark);
    trunk.position.set(T.x, T.base - 2.4 + (T.height + 2.4) / 2, T.z);
    oak.add(trunk);
    for (let i = 0; i < 6; i++) {
      const a = i * 1.047 + 0.3;
      const root = new THREE.Mesh(new THREE.CapsuleGeometry(0.45, 2.2, 4, 10), barkSmall);
      root.position.set(Math.cos(a) * 2.6, T.base + 0.2, Math.sin(a) * 2.6);
      root.rotation.set(0, -a, 0); root.rotateZ(Math.PI / 2 - 0.35);
      oak.add(root);
    }
    const branchTop = M.mat(0x9a6a3c, { roughness: 0.9 });
    const leafGeo = W.leafClusterGeo(lite ? 10 : 16);
    for (const s of S.treeSteps) {
      const pad = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.35, 0.5, 28), woodTop ? [barkSmall, woodTop, barkSmall] : branchTop);
      pad.position.set(s.x, s.top - 0.25, s.z);
      oak.add(pad);
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 2.4, 12), barkSmall);
      arm.position.set(s.x * 0.62, s.top - 0.7, s.z * 0.62);
      arm.rotation.set(0, -s.a, 0); arm.rotateZ(Math.PI / 2 + 0.35);
      oak.add(arm);
      const tuft = new THREE.Mesh(leafGeo, W.leafMaterial());
      tuft.customDepthMaterial = W.leafDepthMaterial();
      tuft.scale.setScalar(0.75);
      tuft.position.set(s.x * 1.35, s.top + 0.15, s.z * 1.35);
      oak.add(tuft);
    }
    const canopy = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 4.3, 0.6, 40), woodTop ? [barkOf(4, 0.3), woodTop, barkSmall] : branchTop);
    canopy.position.set(0, S.TREE_TOP - 0.3, 0);
    oak.add(canopy);
    shadowy(oak); sc.add(oak);
    const crown = [];
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; crown.push([Math.cos(a) * 6.6, S.TREE_TOP - 2.6 + (i % 2) * 0.6, Math.sin(a) * 6.6, 2.1 + (i % 3) * 0.4]); }
    for (let i = 0; i < 7; i++) { const a = (i / 7) * Math.PI * 2 + 0.4; crown.push([Math.cos(a) * 6.6, S.TREE_TOP - 7 - (i % 3) * 3, Math.sin(a) * 6.6, 1.8]); }
    const crownI = new THREE.InstancedMesh(leafGeo, W.leafMaterial(), crown.length);
    crownI.customDepthMaterial = W.leafDepthMaterial();
    const cc = new THREE.Color();
    crown.forEach(([x, y, z, s], i) => {
      m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(i, i * 2, 0)), sv.set(s, s * 0.85, s));
      crownI.setMatrixAt(i, m4);
      crownI.setColorAt(i, cc.set([0x4caf3a, 0x5cc046, 0x6ccf4e][i % 3]));
    });
    crownI.castShadow = crownI.receiveShadow = true;
    sc.add(crownI);
    if (W.LOOK.real) W.buildLeafFringe(sc, crownI, crown.map(([x, y, z, s]) => ({ x, y, z, s })), { lite }, lite ? 8 : 30);
    // le petit drapeau du sommet (le moteur le fait flotter)
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 2.6, 10), M.mat(0xf4f4f4, { roughness: 0.4 }));
    pole.position.set(-2.8, S.TREE_TOP + 1.3, -2.8); pole.castShadow = true; sc.add(pole);
    const flagGeo = new THREE.PlaneGeometry(1.2, 0.75, 8, 1);
    game.flag = new THREE.Mesh(flagGeo, M.mat(0xe03a3a, { side: THREE.DoubleSide, roughness: 0.7 }));
    game.flag.position.set(-2.8, S.TREE_TOP + 2.2, -2.2); game.flag.rotation.y = Math.PI / 2;
    game.flag.castShadow = true; sc.add(game.flag);
    game.flagBase = Float32Array.from(flagGeo.attributes.position.array);
  }
  // les 6 petites lanternes du sommet du chêne : elles s'allument une à une
  const oakLamps = [];
  {
    const post = K.lanternPostGeo();
    for (let i = 0; i < S.LANTERNS.length; i++) {
      const a = i / S.LANTERNS.length * Math.PI * 2 + 0.3, x = Math.cos(a) * 3.9, z = Math.sin(a) * 3.9;
      const g = new THREE.Group();
      g.add(new THREE.Mesh(post, VM));
      const glass = new THREE.Mesh(K.lanternGlassGeo(), new THREE.MeshStandardMaterial({ color: 0x9a9080, emissive: 0x000000, roughness: 0.3, transparent: true, opacity: 0.85 }));
      g.add(glass);
      g.scale.setScalar(0.55);
      g.position.set(x, S.TREE_TOP, z);
      shadowy(g); sc.add(g);
      oakLamps.push(glass);
    }
  }

  // --- La niche de Mamie --------------------------------------------------------------
  {
    const kennel = new THREE.Group();
    const planks = real && RT.hasPhotos() ? RT.photo('brown_planks_03', 1) : null;
    const kb = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.6, 2.2), planks ? new THREE.MeshStandardMaterial({ map: planks.map, normalMap: planks.normalMap, roughness: 0.85, color: new THREE.Color(0xd8c0a0).multiplyScalar(1.5) }) : M.mat(0xe0b070, { roughness: 0.8 }));
    kb.position.y = 0.8; kennel.add(kb);
    const roofShape = new THREE.Shape();
    roofShape.moveTo(-1.55, 0); roofShape.lineTo(0, 1.25); roofShape.lineTo(1.55, 0); roofShape.lineTo(-1.55, 0);
    const tiles = real && RT.hasPhotos() ? RT.photo('clay_roof_tiles', 0.5) : null;
    const roof = new THREE.Mesh(new THREE.ExtrudeGeometry(roofShape, { depth: 2.7, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.08, bevelSegments: 2 }),
      tiles ? new THREE.MeshStandardMaterial({ map: tiles.map, normalMap: tiles.normalMap, roughness: 0.75 }) : M.mat(0xd8443a, { roughness: 0.6 }));
    roof.position.set(0, 1.55, -1.35); kennel.add(roof);
    const door = new THREE.Mesh(new THREE.CircleGeometry(0.55, 24), M.mat(0x2a1608, { roughness: 1 }));
    door.position.set(0, 0.65, 1.11); kennel.add(door);
    const doorB = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.65), door.material);
    doorB.position.set(0, 0.33, 1.11); kennel.add(doorB);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.25, 0.2, 20), M.mat(0x3a8ae0, { roughness: 0.4 }));
    bowl.position.set(1.0, 0.1, 1.7); kennel.add(bowl);
    shadowy(kennel);
    kennel.position.set(S.KENNEL.x, H(S.KENNEL.x, S.KENNEL.z), S.KENNEL.z);
    kennel.rotation.y = 0.5;
    sc.add(kennel);
  }

  // --- L'entrée : fontaine (le moteur fait jaillir l'eau), piédestal des balles ----------
  {
    const F = S.FOUNTAIN;
    put(K.fountainGeo(F.r, 0.65, 1.6), F.x, F.y, F.z);
    const water = new THREE.Mesh(new THREE.CircleGeometry(F.r - 0.2, 32), new THREE.MeshStandardMaterial({ color: 0x5fd0f0, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }));
    water.rotation.x = -Math.PI / 2; water.position.set(F.x, F.y + 0.5, F.z); water.userData.noOutline = true;
    sc.add(water);
    game.fallPos = new THREE.Vector3(F.x - 1, F.y + 2.1, F.z);
    // bancs et parterres de fleurs autour
    for (const [dx, dz, ry] of [[-6, 4, 0.6], [6, 4, -0.6], [-6.5, -3, 2.2], [6.5, -3, -2.2]]) put(K.benchGeo(), F.x + dx, H(F.x + dx, F.z + dz), F.z + dz, ry);
  }
  game.pedestal = M.buildPedestal();
  game.pedestal.position.set(S.PEDESTAL.x, S.PEDESTAL.y, S.PEDESTAL.z);
  sc.add(game.pedestal);
  game.pedestalBalls = [];
  for (let i = 0; i < 5; i++) {
    const b = M.buildBall(); const a = (i / 5) * Math.PI * 2;
    b.scale.setScalar(0.6); b.position.set(Math.cos(a) * 0.95, 0.85, Math.sin(a) * 0.95); b.visible = false;
    game.pedestal.add(b); game.pedestalBalls.push(b);
  }

  // --- La mare : îlot, ponton, roseaux, nénuphars, canards -------------------------------
  {
    const I = S.ISLET;
    const isletGeo = new THREE.CylinderGeometry(I.r * 0.98, I.r * 1.3, 4, 28, 2);
    const k = new K.Kit();
    k.add(isletGeo, (x, y, z, c) => c.set(y > 1.9 ? 0x66bf44 : 0xe8d098));
    put(k.geo(), I.x, I.top - 2, I.z);
    // un petit saule sur l'îlot
    const tk = new K.Kit();
    tk.add(new THREE.CylinderGeometry(0.18, 0.28, 2.6, 8), 0x7a5030, { y: 1.3 });
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; tk.add(new THREE.SphereGeometry(0.9, 10, 8), i % 2 ? 0x6ab840 : 0x5aa838, { x: Math.cos(a) * 0.9, y: 2.6 - (i % 2) * 0.3, z: Math.sin(a) * 0.9, sy: 1.3 }); }
    put(tk.geo(), I.x - 1.4, I.top, I.z + 1.2);
    // le ponton
    const J = S.JETTY, pk = new K.Kit(), len = J.x0 - J.x1;
    for (let i = 0; i < Math.round(len / 0.5); i++) pk.add(new THREE.BoxGeometry(0.44, 0.12, J.w), i % 2 ? 0xa87a4a : 0x9a6e40, { x: J.x1 + 0.25 + i * 0.5, y: J.top - 0.06 });
    for (const sz of [-1, 1]) for (const x of [J.x1 + 0.3, (J.x0 + J.x1) / 2, J.x0 - 0.3]) pk.add(new THREE.CylinderGeometry(0.1, 0.1, 3, 8), 0x6a4a2a, { x, y: J.top - 1.4, z: sz * (J.w / 2 - 0.1) });
    put(pk.geo(), 0, 0, J.z);
    // roseaux et nénuphars (instanciés)
    const r = rng(41), reeds = [], lilies = [];
    for (let i = 0; i < 600 && reeds.length < (lite ? 14 : 30); i++) {
      const a = r() * Math.PI * 2, d = S.POND.r * (0.7 + r() * 0.35);
      const x = S.POND.x + Math.cos(a) * d, z = S.POND.z + Math.sin(a) * d, h = H(x, z);
      if (h < -0.4 || h > 0.8 || (Math.abs(z - J.z) < 3 && x > J.x1 - 2)) continue;
      reeds.push([x, Math.max(h, -0.3), z, r() * 6]);
    }
    for (let i = 0; i < 16; i++) { const a = i * 0.9 + 0.3, d = 4 + (i % 4) * 2.4; const x = S.POND.x + Math.cos(a) * d, z = S.POND.z + Math.sin(a) * d; if (Math.hypot(x - I.x, z - I.z) > I.r + 1 && H(x, z) < -0.8) lilies.push([x, z, r() * 6, 0.7 + r() * 0.6]); }
    const rk = new K.Kit();
    for (let i = 0; i < 6; i++) { const a = i * 1.05; rk.add(new THREE.CylinderGeometry(0.02, 0.035, 1.5 + (i % 3) * 0.3, 4), 0x5a9a3a, { x: Math.cos(a) * 0.18, y: 0.75, z: Math.sin(a) * 0.18, rz: Math.cos(a) * 0.12 }); }
    rk.add(new THREE.CapsuleGeometry(0.05, 0.25, 3, 6), 0x7a4a2a, { y: 1.55 });
    const ri = new THREE.InstancedMesh(rk.geo(), VM, reeds.length);
    reeds.forEach(([x, y, z, a], i) => { m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(0, a, 0)), sv.set(1, 1, 1)); ri.setMatrixAt(i, m4); });
    ri.castShadow = true; place(ri, S.POND.x, S.POND.z, S.POND.r + 4);
    const lk = new K.Kit();
    lk.add(new THREE.CircleGeometry(0.5, 14, 0.3, Math.PI * 2 - 0.5).rotateX(-Math.PI / 2), 0x4a9a3a);
    lk.add(new THREE.SphereGeometry(0.12, 8, 6), 0xffb0d0, { y: 0.05, x: 0.15, sy: 0.6 });
    const li = new THREE.InstancedMesh(lk.geo(), VM, lilies.length);
    lilies.forEach(([x, z, a, s], i) => { m4.compose(v3.set(x, S.WATER_Y + 0.03, z), q.setFromEuler(e.set(0, a, 0)), sv.set(s, 1, s)); li.setMatrixAt(i, m4); });
    li.userData.noOutline = true; place(li, S.POND.x, S.POND.z, S.POND.r + 4);
  }
  // les canards (une maman et ses canetons, deux copines)
  const DUCKS = 7;
  const duckGeo = (() => { const k = new K.Kit(); k.add(new THREE.SphereGeometry(1, 16, 10).scale(0.2, 0.13, 0.28), 0xfff8f0, { y: 0.1 }); k.add(new THREE.SphereGeometry(0.11, 12, 9), 0x2a8a4a, { y: 0.32, z: 0.18 }); k.add(new THREE.SphereGeometry(1, 8, 6).scale(0.06, 0.025, 0.09), 0xf0a020, { y: 0.29, z: 0.32 }); return k.geo(); })();
  const duckI = new THREE.InstancedMesh(duckGeo, VM, DUCKS);
  duckI.frustumCulled = false; duckI.castShadow = true; sc.add(duckI); moving.push(duckI);

  // --- Les pédalos-cygnes ----------------------------------------------------------------
  const swanGeo = K.swanGeo();
  const boats = S.BOATS.map((b) => {
    const m = new THREE.Mesh(swanGeo, VM); shadowy(m); sc.add(m); moving.push(m);
    return { id: b.id, x: b.x, z: b.z, yaw: b.yaw, speed: 0, driver: -1, m, home: { x: b.x, z: b.z, yaw: b.yaw } };
  });

  // --- Le kiosque à musique --------------------------------------------------------------
  {
    const Kk = S.KIOSK;
    put(K.kioskGeo(Kk.r, Kk.floor - Kk.y, Kk.roof - Kk.y), Kk.x, Kk.y, Kk.z);
    S.KIOSK_STEPS.forEach((s, i) => put(K.bandCrateGeo(s.w, s.top - s.y + 0.4, [0xe05a3a, 0x3a8ae0, 0xf0c040][i]), s.x, s.y - 0.4, s.z, i * 0.4));
    put(K.drumGeo(), Kk.x - 1.5, Kk.floor, Kk.z - 1.2); put(K.drumGeo(), Kk.x + 1.2, Kk.floor, Kk.z - 1.8, 0, 0.7);
  }

  // --- Le manège -------------------------------------------------------------------------
  const carousel = new THREE.Group();
  const horses = [];
  {
    const C = S.CAROUSEL, fh = C.floor - C.y;
    put(K.carouselBaseGeo(C.r, fh), C.x, C.y, C.z);
    const top = new THREE.Mesh(K.carouselTopGeo(C.r, 4.0), VM);
    carousel.add(top);
    const cols = [0xffffff, 0xf6c8a0, 0xb0d8ff, 0xffe0f0, 0xd8b0ff, 0xfff0a0];
    for (let i = 0; i < 6; i++) {
      const h = new THREE.Mesh(K.horseGeo(cols[i]), VM);
      const a = i / 6 * Math.PI * 2;
      h.position.set(Math.cos(a) * (C.r - 1.6), 1.3, Math.sin(a) * (C.r - 1.6));
      h.rotation.y = -a + Math.PI;      // tête dans le sens de la rotation
      carousel.add(h); horses.push(h);
    }
    carousel.position.set(C.x, C.floor, C.z);
    shadowy(carousel); sc.add(carousel); moving.push(carousel);
    cull.push({ obj: carousel, x: C.x, z: C.z, r: 10 });
  }

  // --- L'aire de jeux --------------------------------------------------------------------
  const swingSeats = [];
  {
    const PG = S.PLAYGROUND, g = PG.y;
    put(K.slideGeo(S.SLIDE, g), S.SLIDE.x, g, S.SLIDE.z);
    S.SLIDE_STEPS.forEach((s, i) => put(K.stepGeo(s.w, s.top - g + 0.3, s.d, [0xe03a3a, 0xf0c040, 0x3a8ae0][i]), s.x, g - 0.3, s.z));
    put(K.swingFrameGeo(), S.SWINGS.x, g, S.SWINGS.z);
    for (const [i, sx] of [[0, -1.2], [1, 1.2]]) {
      const seat = new THREE.Mesh(K.swingSeatGeo(i ? 0xe03a6a : 0x3ab0e0), VM);
      seat.position.set(S.SWINGS.x + sx, g + 2.95, S.SWINGS.z);
      shadowy(seat); place(seat, seat.position.x, seat.position.z, 4); moving.push(seat);
      swingSeats.push({ m: seat, a: 0, x: S.SWINGS.x + sx, y: g + 2.95, z: S.SWINGS.z, rider: -1 });
    }
    put(K.seesawToyGeo(), PG.x - 2, g, PG.z + 12, 0.4);
    // le bac à sable : sable, bordure de rondins, seau et pelle, petits tas
    const SP = S.SANDPIT;
    const sand = new THREE.Mesh(new THREE.CircleGeometry(SP.r, 36), new THREE.MeshStandardMaterial({ color: 0xf0d89c, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    sand.rotation.x = -Math.PI / 2; sand.position.set(SP.x, H(SP.x, SP.z) + 0.04, SP.z); sand.receiveShadow = true; sand.userData.noOutline = true;
    place(sand, SP.x, SP.z, SP.r);
    put(K.sandBorderGeo(SP.r), SP.x, H(SP.x, SP.z), SP.z);
    put(K.bucketGeo(), SP.x - 2.5, H(SP.x, SP.z) + 0.05, SP.z + 2, 1.2);
    for (const [dx, dz] of [[-3, -2], [2.6, 3]]) { const k = new K.Kit(); k.add(new THREE.SphereGeometry(0.6, 12, 8), 0xe8cc88, { sy: 0.4 }); put(k.geo(), SP.x + dx, H(SP.x, SP.z), SP.z + dz); }
  }

  // --- Le pique-nique --------------------------------------------------------------------
  {
    const P = S.PICNIC;
    const cols = [[0xe03a3a, 0xffffff], [0x3a8ae0, 0xffffff], [0xf0c040, 0xffffff]];
    [[-4, -2, 0.3], [4, 3, -0.5], [-2, 6, 1.2]].forEach(([dx, dz, ry], i) => {
      const x = P.x + dx, z = P.z + dz, y = H(x, z) + 0.03;
      put(K.blanketGeo(cols[i][0], cols[i][1]), x, y, z, ry);
      put(K.basketGeo(), x + 0.6, y, z - 0.4, ry);
      put(K.sandwichGeo(), x - 0.5, y, z + 0.3, ry);
    });
    put(K.parasolGeo(0xe03a3a), P.x - 2.5, H(P.x - 2.5, P.z - 4), P.z - 4);
    put(K.parasolGeo(0x3a8ae0), P.x + 6, H(P.x + 6, P.z + 1), P.z + 1);
    for (const [dx, dz, ry] of [[8, -4, -1], [-8, 2, 1.5]]) put(K.benchGeo(), P.x + dx, H(P.x + dx, P.z + dz), P.z + dz, ry);
  }

  // --- Le terrain d'agility --------------------------------------------------------------
  let seesawPlank = null;
  const gateGlow = new THREE.Mesh(new THREE.TorusGeometry(1.4, 0.12, 8, 32), new THREE.MeshBasicMaterial({ color: 0xffe060, transparent: true, opacity: 0.85, depthWrite: false, fog: false }));
  gateGlow.visible = false; gateGlow.userData.noOutline = true; sc.add(gateGlow);
  const gateArrow = new THREE.Mesh(new THREE.ConeGeometry(0.45, 0.9, 12), new THREE.MeshBasicMaterial({ color: 0xffd23a, fog: false }));
  gateArrow.rotation.x = Math.PI; gateArrow.visible = false; gateArrow.userData.noOutline = true; sc.add(gateArrow);
  let gaston = null;
  {
    const A = S.AGILITY;
    for (const o of S.COURSE) {
      if (o.type === 'hurdle') put(K.hurdleGeo(o.half), o.x, o.y, o.z);
      else if (o.type === 'tunnel') put(K.tunnelGeo(o.len, 1.05), o.x, o.y + 0.9, o.z);
      else if (o.type === 'weave') for (const p of o.poles) put(K.weavePoleGeo(), p.x, H(p.x, p.z), p.z);
      else if (o.type === 'seesaw') {
        put(K.seesawBaseGeo(), o.cx, o.y, o.z);
        seesawPlank = new THREE.Mesh(K.seesawPlankGeo(o.len), VM);
        seesawPlank.position.set(o.cx, o.top - 0.06, o.z); shadowy(seesawPlank); place(seesawPlank, o.cx, o.z, 5); moving.push(seesawPlank);
      } else if (o.type === 'tire') put(K.tireGeo(o.cy - o.y), o.x, o.y, o.z);
      else if (o.type === 'table') put(K.tableGeo(o.w, o.top - o.y), o.x, o.y, o.z);
      else if (o.type === 'finish') put(K.archGeo(o.half), o.x, o.y, o.z);
    }
    put(K.podiumGeo(S.PODIUM.w, S.PODIUM.top - H(S.PODIUM.x, S.PODIUM.z) + 0.3), S.PODIUM.x, H(S.PODIUM.x, S.PODIUM.z) - 0.3, S.PODIUM.z);
    // une clôture basse tout autour (ouverte à l'ouest, du côté de Gaston)
    const x0 = A.x - A.hw, x1 = A.x + A.hw, z0 = A.z - A.hd, z1 = A.z + A.hd;
    for (const [cx, cz, len, ry] of [[A.x, z0, A.hw * 2, 0], [A.x, z1, A.hw * 2, 0], [x1, A.z, A.hd * 2, Math.PI / 2], [x0, z0 + 5, 10, Math.PI / 2], [x0, z1 - 5, 10, Math.PI / 2]]) {
      const n = Math.ceil(len / 8);
      for (let i = 0; i < n; i++) {
        const f = -len / 2 + (i + 0.5) * len / n;
        const x = cx + (ry ? 0 : f), z = cz + (ry ? f : 0);
        put(K.lowFenceGeo(len / n), x, H(x, z), z, ry);
      }
    }
    // Gaston, l'entraîneur
    gaston = K.buildGaston();
    gaston.position.set(S.npcs.gaston.x, S.npcs.gaston.y, S.npcs.gaston.z);
    gaston.rotation.y = Math.PI / 2;
    shadowy(gaston); sc.add(gaston); chars.push(gaston);
  }

  // --- Le belvédère : estrade, longue-vue, bancs, rambarde -------------------------------
  {
    const D = S.DECK, k = new K.Kit();
    k.add(new THREE.BoxGeometry(D.w, 0.5, D.d), (x, y, z, c) => c.set(Math.floor((x + 9) * 2) % 2 ? 0xb07a48 : 0xa06a3a), { y: -0.25 });
    for (const sx of [-1, 1]) k.add(new THREE.BoxGeometry(0.1, 0.1, D.d), 0x8a5a30, { x: sx * D.w / 2, y: 0.85 });
    k.add(new THREE.BoxGeometry(D.w, 0.1, 0.1), 0x8a5a30, { y: 0.85, z: -D.d / 2 });
    for (let i = 0; i <= 8; i++) k.add(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 5), 0x8a5a30, { x: -D.w / 2 + i * D.w / 8, y: 0.45, z: -D.d / 2 });
    put(k.geo(), D.x, D.top, D.z);
    put(K.telescopeGeo(), S.TELESCOPE.x, D.top, S.TELESCOPE.z, Math.PI);
    put(K.benchGeo(), D.x - 1.5, D.top, D.z + 1.5, 0);
  }

  // --- Le labyrinthe fleuri et le jardin secret : des haies ---------------------------------
  {
    const tex = K.hedgeTexture();
    const pos = [], nor = [], uv = [];
    const addBox = (h) => {
      const g = new THREE.BoxGeometry(h.w, h.h, h.d).toNonIndexed();
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i) + h.x, y = p.getY(i) + h.y + h.h / 2, z = p.getZ(i) + h.z;
        pos.push(x, y, z); nor.push(n.getX(i), n.getY(i), n.getZ(i));
        const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
        uv.push(ay > 0.5 ? x * 0.4 : ax > 0.5 ? z * 0.4 : x * 0.4, ay > 0.5 ? z * 0.4 : y * 0.4);
      }
    };
    for (const h of S.HEDGES) if (!h.round) addBox(h);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    const hm = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, color: real ? 0xc8d8b8 : 0xffffff }));
    hm.castShadow = hm.receiveShadow = true;
    place(hm, S.MAZE.x, S.MAZE.z, S.MAZE.n * S.MAZE.cell * 0.75);
    // le jardin secret : de gros buissons ronds, serrés
    const round = S.HEDGES.filter(h => h.round);
    const bi = new THREE.InstancedMesh(W.leafClusterGeo(lite ? 10 : 16), W.leafMaterial(), round.length * 2);
    const cc = new THREE.Color();
    round.forEach((h, i) => {
      for (let k = 0; k < 2; k++) {
        m4.compose(v3.set(h.x, h.y + 0.9 + k * 0.9, h.z), q.setFromEuler(e.set(i, i * 1.7 + k, 0)), sv.set(1.9 - k * 0.3, 1.4 - k * 0.2, 1.9 - k * 0.3));
        bi.setMatrixAt(i * 2 + k, m4); bi.setColorAt(i * 2 + k, cc.set(k ? 0x5cc046 : 0x3e9e34));
      }
    });
    bi.castShadow = bi.receiveShadow = true; bi.customDepthMaterial = W.leafDepthMaterial();
    place(bi, S.GARDEN.x, S.GARDEN.z, S.GARDEN.r + 4);
    // dans le jardin : une fontaine, une statue de chien, des fleurs
    put(K.fountainGeo(1.4, 0.7, 0.6), S.GARDEN.x, S.GARDEN.y, S.GARDEN.z);
    put(K.statueGeo(), S.GARDEN.x - 4, H(S.GARDEN.x - 4, S.GARDEN.z - 3), S.GARDEN.z - 3, 0.8);
    put(K.benchGeo(), S.GARDEN.x + 4, H(S.GARDEN.x + 4, S.GARDEN.z + 2), S.GARDEN.z + 2, -2.2);
    // une arche fleurie à l'entrée du labyrinthe
    const I = S.MAZE_INFO, ak = new K.Kit();
    for (const sx of [-1, 1]) ak.add(new THREE.CylinderGeometry(0.15, 0.15, 3, 8), 0xffffff, { x: sx * 2, y: 1.5 });
    ak.add(new THREE.TorusGeometry(2, 0.18, 8, 20, Math.PI), 0xffffff, { y: 3 });
    for (let i = 0; i < 12; i++) { const a = i / 11 * Math.PI; ak.add(new THREE.SphereGeometry(0.22, 8, 6), [0xff8ab8, 0xfff070, 0xc89aff][i % 3], { x: Math.cos(a) * 2, y: 3 + Math.sin(a) * 2, z: 0.15 }); }
    put(ak.geo(), I.x0 + I.N * I.C / 2, H(I.x0 + I.N * I.C / 2, I.z0 + I.N * I.C), I.z0 + I.N * I.C);
  }

  // --- La cabane perchée ----------------------------------------------------------------------
  {
    const T = S.TREEHOUSE, g = T.y;
    const bark = M.mat(0x7a5030, { roughness: 0.95 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.5, S.TH_DECK.top + 4 - g, 16), bark);
    trunk.position.set(T.x, (S.TH_DECK.top + 4 + g) / 2 - 0.5, T.z); shadowy(trunk);
    place(trunk, T.x, T.z, 10);
    const k = new K.Kit();
    for (const s of S.TH_STEPS) {
      k.add(new THREE.CylinderGeometry(s.r, s.r * 0.9, 0.35, 14), (x, y, z, c) => c.set(y > 0.1 ? 0xc89a68 : 0x8a5a30), { x: s.x - T.x, y: s.top - 0.18 - g, z: s.z - T.z });
      k.add(new THREE.CylinderGeometry(0.15, 0.22, 2.0, 8), 0x7a5030, { x: (s.x - T.x) * 0.62, y: s.top - 0.6 - g, z: (s.z - T.z) * 0.62, ry: -s.a, rz: Math.PI / 2 + 0.4 });
    }
    put(k.geo(), T.x, g, T.z);
    put(K.treehouseGeo(S.TH_DECK.r), T.x, S.TH_DECK.top, T.z, 0.4);
    const blobs = [];
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; blobs.push([T.x + Math.cos(a) * 3.2, S.TH_DECK.top + 4.2 + (i % 3) * 0.5, T.z + Math.sin(a) * 3.2, 1.8]); }
    blobs.push([T.x, S.TH_DECK.top + 5.6, T.z, 2.6]);
    const li = new THREE.InstancedMesh(W.leafClusterGeo(lite ? 10 : 16), W.leafMaterial(), blobs.length);
    const cc = new THREE.Color();
    blobs.forEach(([x, y, z, s], i) => { m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(i, i * 2, 0)), sv.set(s, s * 0.85, s)); li.setMatrixAt(i, m4); li.setColorAt(i, cc.set([0x4caf3a, 0x5cc046, 0x6ccf4e][i % 3])); });
    li.castShadow = li.receiveShadow = true; li.customDepthMaterial = W.leafDepthMaterial();
    place(li, T.x, T.z, 10);
  }

  // --- Les cerisiers en fleurs ------------------------------------------------------------
  {
    const list = S.CHERRY_TREES, n = list.length;
    const tk = new K.Kit();
    tk.add(new THREE.CylinderGeometry(0.22, 0.4, 1, 8), 0x6a3a2a, { y: 0.5 });
    const ti = new THREE.InstancedMesh(tk.geo(), VM, n);
    const blobs = [];
    const r = rng(77);
    list.forEach((t, i) => {
      m4.compose(v3.set(t.x, t.y, t.z), q.identity(), sv.set(t.s, t.h * 0.75, t.s)); ti.setMatrixAt(i, m4);
      for (let k = 0; k < 4; k++) { const a = k / 4 * Math.PI * 2 + r(); blobs.push([t.x + Math.cos(a) * (k ? 1.1 : 0) * t.s, t.y + t.h * 0.75 + (k ? 0.2 : 0.9), t.z + Math.sin(a) * (k ? 1.1 : 0) * t.s, (k ? 1.1 : 1.5) * t.s]); }
    });
    ti.castShadow = true; place(ti, S.CHERRY.x, S.CHERRY.z, 14);
    const li = new THREE.InstancedMesh(W.leafClusterGeo(lite ? 10 : 16), W.leafMaterial(), blobs.length);
    const cc = new THREE.Color();
    blobs.forEach(([x, y, z, s], i) => { m4.compose(v3.set(x, y, z), q.setFromEuler(e.set(i, i * 2, 0)), sv.set(s, s * 0.85, s)); li.setMatrixAt(i, m4); li.setColorAt(i, cc.set([0xffb8d8, 0xff9ac8, 0xffd0e4, 0xf8a8d0][i % 4])); });
    li.castShadow = li.receiveShadow = true; li.customDepthMaterial = W.leafDepthMaterial();
    place(li, S.CHERRY.x, S.CHERRY.z, 14);
    // pétales roses au sol
    const pk = new K.Kit();
    for (let i = 0; i < 40; i++) { const a = r() * Math.PI * 2, d = r() * 11; pk.add(new THREE.CircleGeometry(0.12, 5).rotateX(-Math.PI / 2), 0xffc0dc, { x: Math.cos(a) * d, y: 0.03, z: Math.sin(a) * d }); }
    put(pk.geo(), S.CHERRY.x, H(S.CHERRY.x, S.CHERRY.z), S.CHERRY.z);
  }

  // --- Le Rocher aux Lapins, la crique, le Bois des Écureuils ------------------------------
  {
    const rm = W.rockMat();
    const rock = (x, z, r, top, seed, base) => {
      const g = base === undefined ? H(x, z) : base, hgt = top - g + 1.2;
      const m = new THREE.Mesh(W.rockGeometry(seed, r * 1.3, hgt / 2, r * 1.3), rm);
      const t = W.flattenRockTop(m.geometry, hgt / 2 * 0.4);
      m.position.set(x, top - t + 0.03, z); shadowy(m); place(m, x, z, r + 2);
    };
    S.RABBIT_ROCKS.forEach((k, i) => rock(k.x, k.z, k.r, k.top, 90 + i));
    rock(S.COVE_ROCK.x, S.COVE_ROCK.z, S.COVE_ROCK.r, S.COVE_ROCK.top, 99, Math.min(0, S.COVE_ROCK.y) - 1);
    put(K.rowboatGeo(), S.ROWBOAT.x, H(S.ROWBOAT.x, S.ROWBOAT.z), S.ROWBOAT.z, S.ROWBOAT.yaw);
    // coquillages sur la plage
    const sk = new K.Kit(), r = rng(5);
    for (let i = 0; i < 14; i++) { const a = r() * 6.28, d = 3 + r() * 10; sk.add(new THREE.SphereGeometry(0.12, 6, 4), [0xffd8c8, 0xfff0e0, 0xffb8a8][i % 3], { x: Math.cos(a) * d, y: 0, z: Math.sin(a) * d, sy: 0.4 }); }
    put(sk.geo(), S.COVE.x, Math.max(0.05, H(S.COVE.x, S.COVE.z)), S.COVE.z);
    // le Bois des Écureuils : un tronc creux, des champignons
    const Wd = S.WOODS;
    put(K.logGeo(), Wd.x + 3, H(Wd.x + 3, Wd.z + 3), Wd.z + 3, 0.7);
    for (let i = 0; i < 9; i++) { const a = i * 0.7, d = 2 + (i % 3) * 2.5; const x = Wd.x + Math.cos(a) * d, z = Wd.z + Math.sin(a) * d; put(K.mushroomGeo(), x, H(x, z), z, a, 0.8 + (i % 3) * 0.3); }
  }
  // lapins (instanciés)
  const rabbits = [];
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, d = 7 + (i % 2) * 3;
    const x = S.RABBIT_ROCK.x - 4 + Math.cos(a) * d, z = S.RABBIT_ROCK.z + 6 + Math.sin(a) * d;
    rabbits.push({ x, z, hx: x, hz: z, yaw: a, hop: 0, t: i * 0.7, y: H(x, z) });
  }
  const rabbitI = new THREE.InstancedMesh(K.rabbitGeo(), VM, rabbits.length);
  rabbitI.castShadow = true; rabbitI.frustumCulled = false; sc.add(rabbitI); moving.push(rabbitI);

  // --- Le petit train : voie, gares, locomotive et wagons -------------------------------------
  {
    const P = S.TRACK.pts, T = S.TRACK.total;
    const nS = Math.floor(T / 1.1);
    const sk = new K.Kit(); sk.add(new THREE.BoxGeometry(2.0, 0.14, 0.32), 0x7a5a3a, { y: 0.07 });
    const sleepers = new THREE.InstancedMesh(sk.geo(), VM, nS);
    for (let i = 0; i < nS; i++) { const p = S.trackAt(i * 1.1); m4.compose(v3.set(p.x, p.y - 0.1, p.z), q.setFromEuler(e.set(0, p.yaw, 0)), sv.set(1, 1, 1)); sleepers.setMatrixAt(i, m4); }
    sleepers.receiveShadow = true; sleepers.userData.noOutline = true; sc.add(sleepers);
    const rk = new K.Kit(); for (const sx of [-0.72, 0.72]) rk.add(new THREE.BoxGeometry(0.1, 0.12, 1), 0x9aa0aa, { x: sx, y: 0.2 });
    const rails = new THREE.InstancedMesh(rk.geo(), new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.6, roughness: 0.35 }), P.length);
    P.forEach((p, i) => { const q2 = P[(i + 1) % P.length], len = Math.hypot(q2.x - p.x, q2.z - p.z); m4.compose(v3.set((p.x + q2.x) / 2, (p.y + q2.y) / 2 - 0.1, (p.z + q2.z) / 2), q.setFromEuler(e.set(Math.atan2(p.y - q2.y, len), p.yaw, 0, 'YXZ')), sv.set(1, 1, len + 0.05)); rails.setMatrixAt(i, m4); });
    rails.userData.noOutline = true; sc.add(rails);
    for (const st0 of S.STATIONS) {
      put(K.stationGeo(st0.name), st0.x, st0.y, st0.z, st0.yaw + (st0.side > 0 ? 0 : Math.PI));
      const b = K.nameBoard(st0.name, 1.8);
      const fy = st0.yaw + (st0.side > 0 ? 0 : Math.PI);
      b.position.set(st0.x + Math.sin(fy) * 1.29, st0.y + 2.45, st0.z + Math.cos(fy) * 1.29);
      b.rotation.y = fy;
      // le panneau regarde la voie
      b.rotation.y = Math.atan2(st0.tx - st0.x, st0.tz - st0.z);
      b.position.set(st0.x + (st0.tx - st0.x) * 0.32, st0.y + 2.45, st0.z + (st0.tz - st0.z) * 0.32);
      place(b, st0.x, st0.z, 4);
    }
  }
  const trainCars = [K.locoGeo(), K.wagonGeo(0xf0c040), K.wagonGeo(0x3a8ae0)].map((g) => { const m = new THREE.Mesh(g, VM); shadowy(m); sc.add(m); moving.push(m); return m; });
  const CAR_GAP = [0, 3.3, 6.2];

  // --- Lanternes magiques ---------------------------------------------------------------------
  const lanterns = S.LANTERNS.map((l) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(K.lanternPostGeo(), VM));
    const glass = new THREE.Mesh(K.lanternGlassGeo(), new THREE.MeshStandardMaterial({ color: 0x8a8478, emissive: 0x000000, roughness: 0.3, transparent: true, opacity: 0.9 }));
    g.add(glass);
    g.position.set(l.x, l.y, l.z);
    shadowy(g); sc.add(g);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0xffb040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
    halo.scale.set(3, 3, 1); halo.position.set(l.x, l.y + 2.55, l.z); halo.userData.noOutline = true; sc.add(halo);
    cull.push({ obj: g, x: l.x, z: l.z, r: 4 });
    return { def: l, g, glass, halo, litAt: -9 };
  });

  // --- Les indices de Biscotte ----------------------------------------------------------------
  const clueMesh = [K.collarGeo(), K.doudouGeo(), K.squeakyGeo()].map((g, i) => {
    const m = new THREE.Mesh(g, VM); const c = S.CLUES[i];
    m.position.set(c.x, c.y + 0.02, c.z); shadowy(m); sc.add(m); moving.push(m);
    m.visible = false;
    return m;
  });
  const mound = new THREE.Mesh(K.moundGeo(), VM);
  mound.position.set(S.DIG.x, H(S.DIG.x, S.DIG.z) + 0.02, S.DIG.z); mound.receiveShadow = true; sc.add(mound);
  const clueMark = game.makeMark('?', 0x8ad0ff); clueMark.visible = false;

  // --- Drapeaux (points de passage) -----------------------------------------------------------
  const flags = S.CHECKPOINTS.map((c) => {
    const f = buildFlag();
    f.position.set(c.x, c.y, c.z);
    f.rotation.y = Math.atan2(S.START.x - c.x, S.START.z - c.z) * 0.3;
    sc.add(f); cull.push({ obj: f, x: c.x, z: c.z, r: 4 });
    return { def: c, f, u: f.userData, raise: park().flags.includes(c.id) ? 1 : 0, raisedAt: -9 };
  });

  // --- Petites touches : bancs le long des chemins, réverbères ---------------------------------
  {
    const r = rng(9);
    for (const [[ax, az], [bx, bz]] of S.PATHS) {
      const len = Math.hypot(bx - ax, bz - az);
      if (len < 25) continue;
      const dx = (bx - ax) / len, dz = (bz - az) / len;
      for (let d = 14; d < len - 8; d += 30) {
        const side = r() < 0.5 ? -1 : 1, x = ax + dx * d - dz * 3.2 * side, z = az + dz * d + dx * 3.2 * side;
        if (S.near(x, z, 1.5).some(c => !c.off && S.inside(c, x, z, 1.2)) || S.inWater(x, z, 0.5)) continue;
        put(K.benchGeo(), x, H(x, z), z, Math.atan2(dz * side, -dx * side));
      }
    }
  }
  flushPacks();

  // =============================================================================
  // État et règles
  // =============================================================================
  const st = {
    train: { s: S.STATIONS[0].s + CAR_GAP[1] + 0.1, v: 0, dwell: 6, last: 0, chug: 0 },
    carA: 0, carMusic: 0, run: null, scopeUntil: -1, lastBark: new Map(), quest: null, hint: {},
  };
  const players = () => game.players;
  const P0 = () => game.me;
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  function reveal(msg, sub) {
    game.updateMedalVisibility();
    game.sound('reveal');
    if (msg) game.banner(msg, sub, 3200);
  }
  function raiseFlag(c) {
    const p = park();
    if (p.flags.includes(c.id)) return;
    p.flags.push(c.id); game.persist();
    flags[c.id].raisedAt = game.t;
    game.sound('cp');
    game.burst(c.x, c.y + 3, c.z, 18, 0xffe070, 3.5, 0.7);
    game.banner('Drapeau !', `${c.name} : si vous tombez, vous repartez d'ici.`, 2000);
  }

  // --- Lanternes ---------------------------------------------------------------------------
  function lightLantern(l) {
    const p = park();
    if (p.lit.includes(l.def.id)) return;
    p.lit.push(l.def.id); game.persist();
    l.litAt = game.t;
    game.sound('lantern');
    game.burst(l.def.x, l.def.y + 2.5, l.def.z, 24, 0xffc860, 4, 0.9);
    const n = p.lit.length, N = S.LANTERNS.length;
    if (n >= N) {
      reveal('Toutes les lanternes brillent !', 'Regardez tout en haut du Grand Chêne…');
      setTimeout(() => { if (!game.disposed && !game.dialog) game.say([{ who: 'Matcha', text: 'Oh ! Le Grand Chêne s\'illumine ! Une médaille brille tout en haut !' }, { who: 'Ainu', text: 'Ouaf ! On grimpe les branches jusqu\'au sommet !' }]); }, 1200);
    } else game.banner(`Lanterne allumée ! ${n}/${N}`, `Encore ${N - n} lanterne${N - n > 1 ? 's' : ''} à rallumer dans le parc`, 2200);
    updateChips(); game.updateHud();
  }

  // --- Biscotte : les indices -----------------------------------------------------------------
  const CLUE_LINES = [
    [
      { who: 'Matcha', text: 'Regarde, Ainu ! Un petit collier rouge… avec un os doré dessus.' },
      { who: 'Ainu', text: 'C\'est le collier de Biscotte ! Il a dû le perdre en courant après les canards.' },
      { who: 'Matcha', text: 'Ses petites traces de pattes partent vers l\'aire de jeux. On les suit !' },
    ],
    [
      { who: 'Matcha', text: 'Son doudou lapin ! Biscotte l\'avait caché dans le sable, comme un trésor.' },
      { who: 'Ainu', text: 'Snif, snif… Une petite piste part du bac à sable vers le manège !' },
    ],
    [
      { who: 'Matcha', text: 'Pouic ! C\'est son jouet qui couine. Biscotte est passé par le manège !' },
      { who: 'Ainu', text: 'Snif, snif… Ça sent les fleurs, maintenant. Il est parti vers le labyrinthe fleuri !' },
      { who: 'Matcha', text: 'Le labyrinthe, au nord-ouest… Biscotte, on arrive !' },
    ],
  ];
  const CLUE_BANNER = [
    ['Indice 1/3 : le collier de Biscotte', 'Les traces mènent à l\'aire de jeux, au sud-ouest'],
    ['Indice 2/3 : le doudou de Biscotte', 'La piste continue vers le manège, au nord-est'],
    ['Indice 3/3 : le jouet de Biscotte', 'Biscotte est dans le labyrinthe fleuri, au nord-ouest !'],
  ];
  function findClue(i) {
    const p = park();
    if (p.clues !== i || st.clueBusy) return;
    st.clueBusy = true;
    const done = () => {
      st.clueBusy = false;
      if (park().clues !== i) return;
      park().clues = i + 1; game.persist();
      game.sound('reveal');
      game.banner(CLUE_BANNER[i][0], CLUE_BANNER[i][1], 3200);
      if (i === 2) showPuppy();
      game.updateHud();
    };
    if (i === 1) {
      // on creuse : le sable vole, le doudou sort
      snd.dig();
      st.digAt = game.t;
      for (let k = 0; k < 3; k++) setTimeout(() => { if (!game.disposed) game.burst(S.DIG.x, H(S.DIG.x, S.DIG.z) + 0.3, S.DIG.z, 14, 0xe8cc88, 4, 0.6); }, k * 250);
      setTimeout(() => { if (!game.disposed) game.say(CLUE_LINES[i], done); }, 900);
      return;
    }
    if (i === 2) snd.squeak();
    game.say(CLUE_LINES[i], done);
  }
  function showPuppy() {
    const pp = game.puppy;
    if (pp.state !== 'lost') return;
    pp.pos.set(S.PUPPY_HIDE.x, S.PUPPY_HIDE.y, S.PUPPY_HIDE.z);
  }
  function hidePuppyIfNeeded() {
    const pp = game.puppy;
    if (pp.state === 'lost' && park().clues < 3 && !game.guest) pp.pos.set(5000, -2000, 5000);
  }

  // --- Agility -----------------------------------------------------------------------------------
  const COURSE = S.COURSE;
  const limit = () => S.AGILITY_TIME[game.mode] || 0;
  function startRun(P) {
    const A = S.AGILITY_START;
    P.pos.set(A.x, H(A.x, A.z), A.z); P.vel.set(0, 0, 0); P.yaw = Math.PI / 2;
    if (P === game.me) game.camYaw = P.yaw + Math.PI;
    st.run = { P, i: 0, t: -3, beat: 3, px: P.pos.x, pz: P.pos.z };
    game.banner('3', 'Prêts ?', 900); snd.beep(false);
    updateChips();
  }
  function stopRun() { st.run = null; gateGlow.visible = false; gateArrow.visible = false; updateChips(); }
  function finishRun() {
    const R = st.run, p = park(), t = Math.round(R.t * 10) / 10;
    stopRun();
    snd.whistle(true);
    const first = !p.agility;
    const rec = !p.best || t < p.best;
    if (rec) p.best = t;
    p.agility = true; game.persist();
    for (const Q of players()) Q.cheerT = 1.4;
    game.burst(R.P.pos.x, R.P.pos.y + 1, R.P.pos.z, 30, 0xffd23a, 5, 0.9);
    if (first) reveal();
    game.say([
      { who: 'Gaston', text: `Bravo ! ${String(t).replace('.', ',')} secondes ! Vous êtes de vrais champions !` },
      first ? { who: 'Gaston', text: 'La médaille est sur le podium, à côté de moi : elle est à vous !' }
        : { who: 'Gaston', text: rec ? 'C\'est un nouveau record ! Incroyable !' : `Votre record reste ${String(p.best).replace('.', ',')} secondes. Encore un essai ?` },
    ]);
  }
  function failRun() {
    stopRun();
    snd.whistle(false);
    game.say([{ who: 'Gaston', text: 'Oh, presque ! Le temps est écoulé… Revenez me voir pour réessayer !' }]);
  }
  function gateCrossed(o, R, P) {
    if (o.type === 'seesaw' || o.type === 'table') return P.grounded && P.onCol && P.onCol === o.col;
    const a = o.ax === 'x' ? 'x' : 'z', b = a === 'x' ? 'z' : 'x';
    const prev = a === 'x' ? R.px : R.pz, cur = P.pos[a];
    if ((prev - o[a]) * (cur - o[a]) > 0 || Math.sign(cur - prev) !== o.dir) return false;
    return Math.abs(P.pos[b] - o[b]) < o.half + 0.7;
  }
  function stepRun(dt) {
    const R = st.run;
    if (!R) return;
    const P = R.P;
    if (!game.party.has(P.id) && P !== game.player) { stopRun(); return; }
    if (R.t < 0) {
      R.t += dt;
      P.vel.x = P.vel.z = 0; P.pos.x = R.px; P.pos.z = R.pz;
      const beat = Math.ceil(-R.t);
      if (beat !== R.beat && beat > 0) { R.beat = beat; game.banner(String(beat), 'Prêts ?', 900); snd.beep(false); }
      if (R.t >= 0) { R.t = 0; game.banner('Partez !', `Passez ${COURSE[0].name} !`, 1200); snd.beep(true); snd.whistle(false); }
      return;
    }
    R.t += dt;
    const o = COURSE[R.i];
    if (gateCrossed(o, R, P)) {
      R.i++;
      game.sound('cp');
      game.burst(o.x, o.y + 1.2, o.z, 14, 0xffe070, 3, 0.6);
      if (R.i >= COURSE.length) { finishRun(); return; }
      game.banner(`${R.i}/${COURSE.length - 1} · ${COURSE[R.i].name} !`, null, 1100);
    }
    R.px = P.pos.x; R.pz = P.pos.z;
    const lim = limit();
    if (lim && R.t > lim) { failRun(); return; }
    if (Math.hypot(P.pos.x - S.AGILITY.x, P.pos.z - S.AGILITY.z) > 45) { stopRun(); game.banner('Course annulée', 'Revenez voir Gaston pour recommencer', 2000); }
  }
  function talkGaston(P) {
    const p = park();
    if (st.run) { game.say([{ who: 'Gaston', text: 'Allez, allez ! Suivez l\'obstacle qui brille !' }]); return; }
    const lim = limit();
    const go = { who: 'Gaston', text: lim ? `Vous avez ${lim} secondes. À vos marques… Prêts ?` : 'Prenez tout votre temps. À vos marques… Prêts ?' };
    if (!p.metGaston) {
      p.metGaston = true; game.persist();
      game.say([
        { who: 'Gaston', text: 'Bonjour les champions ! Je suis Gaston, l\'entraîneur d\'agility du parc.' },
        { who: 'Gaston', text: 'Les chats de la Capitaine ont emporté la médaille de mon parcours. Ils ont dit : « Seuls de vrais champions pourront la gagner ! »' },
        { who: 'Matcha', text: 'Un parcours d\'obstacles ? C\'est pour nous, ça !' },
        { who: 'Gaston', text: 'Il faut passer les obstacles dans l\'ordre : la haie, le tunnel, le slalom, la bascule, le pneu, la grande haie, la table… et l\'arrivée !' },
        { who: 'Gaston', text: 'L\'obstacle suivant brille en doré. Sautez bien par-dessus les haies !' },
        go,
      ], () => startRun(P));
      return;
    }
    if (p.agility) game.say([{ who: 'Gaston', text: `Votre record : ${String(p.best).replace('.', ',')} secondes ! On refait un tour pour le battre ?` }, go], () => startRun(P));
    else game.say([{ who: 'Gaston', text: 'On recommence ? Je relance le chrono !' }, go], () => startRun(P));
  }

  // --- Longue-vue -------------------------------------------------------------------------------
  function scopeTargets() {
    const p = park(), s = save(), out = [];
    const where = (t) => t;
    if (p.clues < 3 && game.puppy.state === 'lost') {
      const c = S.CLUES[p.clues];
      out.push({ x: c.x, y: c.y, z: c.z, text: ['Là-bas, près de la mare : quelque chose de rouge brille dans l\'herbe…', 'Dans le bac à sable de l\'aire de jeux : des petites traces de pattes !', 'Sur le manège : un drôle de jouet rose…'][p.clues] });
    } else if (game.puppy.state === 'lost') out.push({ x: S.PUPPY_HIDE.x, y: S.PUPPY_HIDE.y, z: S.PUPPY_HIDE.z, text: 'Au milieu du labyrinthe fleuri… c\'est Biscotte !' });
    for (const l of S.LANTERNS) if (!p.lit.includes(l.id)) out.push({ x: l.x, y: l.y + 1, z: l.z, text: where(`Une lanterne éteinte, ${l.where} !`), lantern: true });
    if (!s.medals.includes('m_balls')) for (const b of game.balls) if (!b.taken) out.push({ x: b.def.x, y: b.def.y, z: b.def.z, text: `Une balle de tennis, ${b.def.where} !` });
    for (const c of game.cats) if (!c.dead && c.def.group === 'clearing') out.push({ x: c.pos.x, y: c.pos.y, z: c.pos.z, text: `Un chat farceur, ${c.def.where} !` });
    return out;
  }
  function lookScope(P) {
    const all = scopeTargets();
    st.scopeUntil = game.t + 120;
    game.sound('reveal');
    if (!all.length) { game.say([{ who: 'Matcha', text: 'Tout est en ordre dans le parc ! Que c\'est beau, vu d\'en haut…' }]); return; }
    // les plus loin d'abord ? non : un de chaque sorte, au plus 4
    const pick = [], seen = new Set();
    for (const t of all) { const k = t.text.split(' ')[1]; if (!seen.has(k) && pick.length < 4) { seen.add(k); pick.push(t); } }
    for (const t of all) if (pick.length < 4 && !pick.includes(t)) pick.push(t);
    if (game.party.size > 1 || game.guest) {
      game.banner('La longue-vue', 'Les trésors cachés sont sur la carte pendant 2 minutes !', 3000);
      return;
    }
    const D = S.DECK;
    const shots = pick.map((t, i) => {
      const dx = t.x - D.x, dz = t.z - D.z, d = Math.hypot(dx, dz) || 1, ux = dx / d, uz = dz / d;
      return {
        d: 3.6, fadeIn: i === 0, from: [t.x - ux * 14 + uz * 4, t.y + 7, t.z - uz * 14 - ux * 4], to: [t.x - ux * 9 + uz * 2, t.y + 4.5, t.z - uz * 9 - ux * 2], look: [t.x, t.y + 0.6, t.z],
        say: { who: 'Matcha', text: t.text }, fov: 45,
      };
    });
    shots[0].title = ['La longue-vue', 'Ce qu\'on voit du belvédère'];
    game.cine = new Cinema(game, shots, () => { game.cine = null; game.banner('La longue-vue', 'Ce que vous avez vu est sur la petite carte pendant 2 minutes !', 3000); });
    void P;
  }

  // --- Les manèges : train, pédalos, manège, balançoires, toboggan ---------------------------------
  function seatPos(i) {
    const car = 1 + (i >> 1), side = i % 2 ? 0.55 : -0.55;
    const p = S.trackAt(st.train.s - CAR_GAP[car]);
    return { x: p.x + Math.sin(p.yaw) * side, y: p.y + 0.95, z: p.z + Math.cos(p.yaw) * side, yaw: p.yaw };
  }
  const trainSeats = () => players().filter(P => P.ride && P.ride.kind === 'train').map(P => P.ride.seat);
  function board(P, kind, extra) {
    P.ride = Object.assign({ kind, t: 0, speed: 0, yaw: P.yaw, camRate: 2.2 }, extra || {});
    P.vel.set(0, 0, 0); P.grounded = true; P.gliding = false; P.attackT = 0; P.dashT = 0;
  }
  function getOff(P, x, z, hop) {
    const R = P.ride;
    if (!R) return;
    if (R.kind === 'boat') R.b.driver = -1;
    if (R.kind === 'swing') swingSeats[R.i].rider = -1;
    P.ride = null;
    const y = game.support(x, z, Math.max(P.pos.y, H(x, z)) + 1.5).y;
    P.pos.set(x, y + 0.05, z);
    P.vel.set(hop ? Math.sin(P.yaw) * hop : 0, hop ? 6 : 0, hop ? Math.cos(P.yaw) * hop : 0);
    P.grounded = !hop;
    P.lastSafe.copy(P.pos); P.lastSafeT = game.t;
    if (P === game.player && game.puppy.state === 'follow') game.puppy.pos.copy(P.pos);
  }
  function exitTrain(P) {
    const p = S.trackAt(st.train.s - CAR_GAP[1 + (P.ride.seat >> 1)]);
    // descendre du côté du quai le plus proche, sinon vers l'intérieur du parc
    const nx = Math.cos(p.yaw), nz = -Math.sin(p.yaw);
    const side = (nx * -p.x + nz * -p.z) > 0 ? 1 : -1;
    getOff(P, p.x + nx * side * 2.6, p.z + nz * side * 2.6, 0);
  }
  /** Le pédalo : peut-il aller là ? (de l'eau assez profonde, pas l'îlot ni le ponton) */
  function boatFree(x, z) {
    if (H(x, z) > -0.35) return false;
    if (Math.hypot(x - S.ISLET.x, z - S.ISLET.z) < S.ISLET.r + 1.0) return false;
    const J = S.JETTY;
    if (x < J.x0 + 0.5 && x > J.x1 - 0.7 && Math.abs(z - J.z) < J.w / 2 + 0.6) return false;
    for (const b of boats) if (b !== st.movingBoat && Math.hypot(b.x - x, b.z - z) < 2.4) return false;
    return true;
  }
  function landNear(x, z, y) {
    let best = null, bd = Infinity;
    for (let a = 0; a < Math.PI * 2; a += Math.PI / 10) {
      for (const d of [2.0, 2.8, 3.6]) {
        const lx = x + Math.cos(a) * d, lz = z + Math.sin(a) * d;
        const s = game.support(lx, lz, 3);
        if (s.y < 0.25 || s.y > y + 2.5) continue;
        if (S.near(lx, lz, 0.8).some(c => (c.solid || c.kind === 'tree' || c.kind === 'rock') && !c.off && c.y1 > s.y + 0.3 && S.inside(c, lx, lz, 0.5))) continue;
        if (d < bd) { bd = d; best = { x: lx, z: lz }; }
      }
    }
    return best;
  }
  function exitBoat(P) {
    const b = P.ride.b, land = landNear(b.x, b.z, P.pos.y);
    if (!land) { game.localBanner('Pas encore !', 'Approche le pédalo du bord (ou de l\'îlot) pour descendre', 2000); return false; }
    getOff(P, land.x, land.z, 0);
    return true;
  }
  function driveBoat(P, wx, wz, dt) {
    const b = P.ride.b, wlen = Math.min(1, Math.hypot(wx, wz));
    if (wlen > 0.15) {
      const want = Math.atan2(wx, wz), d = angDiff(want, b.yaw);
      b.yaw += clamp(d, -2.0 * dt, 2.0 * dt);
      const fwd = Math.cos(d) > -0.2 ? 1 : 0.3;
      b.speed += (5.2 * wlen * fwd - b.speed) * Math.min(1, dt * 1.6);
    } else b.speed *= Math.max(0, 1 - dt * 1.5);
    const nx = b.x + Math.sin(b.yaw) * b.speed * dt, nz = b.z + Math.cos(b.yaw) * b.speed * dt;
    st.movingBoat = b;
    const fx = Math.sin(b.yaw) * 1.3, fz = Math.cos(b.yaw) * 1.3;
    if (boatFree(nx, nz) && boatFree(nx + fx, nz + fz)) { b.x = nx; b.z = nz; }
    else if (boatFree(nx, b.z) && boatFree(nx + fx, b.z + fz * 0.3)) { b.x = nx; b.speed *= 0.97; }        // on glisse le long du bord
    else if (boatFree(b.x, nz) && boatFree(b.x + fx * 0.3, nz + fz)) { b.z = nz; b.speed *= 0.97; }
    else { if (Math.abs(b.speed) > 1.5) game.sound('bump'); b.speed = -b.speed * 0.25; }
    st.movingBoat = null;
    if (Math.abs(b.speed) > 0.8 && Math.floor(game.t * 2.5) !== Math.floor((game.t - dt) * 2.5)) snd.paddle();
    P.pos.set(b.x - Math.sin(b.yaw) * 0.2, S.WATER_Y + 0.42, b.z - Math.cos(b.yaw) * 0.2);
    P.yaw = b.yaw; P.ride.speed = b.speed; P.ride.yaw = b.yaw;
  }
  function rideStep(P, wx, wz, jumpHeld, pr, dt) {
    const R = P.ride;
    R.t += dt;
    P.invuln = Math.max(0, P.invuln - dt); P.cheerT = Math.max(0, P.cheerT - dt); P.flipT = 0;
    P.vel.set(0, 0, 0); P.grounded = true; P.gliding = false; P.attackT = 0; P.dashT = 0;
    const wantOff = !game.dialog && game.freeze <= 0 && (pr.has('talk') || pr.has('jump'));
    if (pr.has('bark') && !game.dialog) { P.barkT = 0.7; game.dogBark(P); }
    if (R.kind === 'train') {
      if (wantOff && R.t > 0.4) { exitTrain(P); return; }
      const s = seatPos(R.seat);
      P.pos.set(s.x, s.y, s.z); P.yaw = s.yaw; R.speed = st.train.v; R.yaw = s.yaw; R.camRate = 2.2;
    } else if (R.kind === 'boat') {
      if (wantOff && R.t > 0.4) { if (exitBoat(P)) return; }
      driveBoat(P, wx, wz, dt);
    } else if (R.kind === 'carousel') {
      const C = S.CAROUSEL, a = R.a + st.carA, rr = C.r - 1.6;
      if ((wantOff && R.t > 0.4) || R.t > 16) { getOff(P, C.x + Math.cos(a) * (C.r + 1.3), C.z + Math.sin(a) * (C.r + 1.3), 0); return; }
      P.pos.set(C.x + Math.cos(a) * rr, C.floor + 1.2 + Math.sin(R.t * 3 + R.a * 3) * 0.25, C.z + Math.sin(a) * rr);
      P.yaw = -a + Math.PI; R.speed = 2; R.yaw = P.yaw; R.camRate = 0.6;
    } else if (R.kind === 'swing') {
      const sw = swingSeats[R.i];
      const amp = Math.min(1, R.t / 2) * 0.85, th = Math.sin(R.t * 2.1) * amp;
      sw.a = th;
      if ((wantOff && R.t > 0.6) || R.t > 10) { sw.a = 0; P.yaw = 0; getOff(P, sw.x, sw.z + 1.6 + Math.max(0, th) * 2, 3); return; }
      P.pos.set(sw.x, sw.y - 2.42 * Math.cos(th) + 0.05, sw.z + 2.42 * Math.sin(th));
      P.yaw = 0; R.speed = 0; R.yaw = 0;
    } else if (R.kind === 'slide') {
      const Sl = S.SLIDE, k = clamp(R.t / 1.3, 0, 1), kk = k * k;
      const x0 = Sl.x + Sl.w / 2, g = S.PLAYGROUND.y;
      const x = x0 + Sl.len * kk + (k >= 1 ? 0 : 0), y = Sl.top + (g + 0.4 - Sl.top) * kk;
      P.pos.set(x, y, Sl.z); P.yaw = Math.PI / 2; R.speed = 8; R.yaw = P.yaw;
      if (k >= 1) { P.ride = null; P.pos.set(x0 + Sl.len + 0.6, g + 0.35, Sl.z); P.vel.set(7, 2, 0); P.grounded = false; P.cheerT = 1; }
    }
  }

  // --- Train : avance, s'arrête aux gares -------------------------------------------------------
  function stepTrain(dt) {
    const T = st.train, total = S.TRACK.total;
    if (T.dwell > 0) {
      T.dwell -= dt; T.v = 0;
      // quelqu'un attend sur le quai : on patiente encore un peu
      const stn = S.STATIONS.find(s0 => Math.abs(angDiff((T.s - CAR_GAP[1] - s0.s) / total * Math.PI * 2, 0)) < 0.02);
      if (T.dwell <= 0 && stn && (T.extra || 0) < 10 && players().some(P => !P.ride && Math.hypot(P.pos.x - stn.x, P.pos.z - stn.z) < 6)) { T.dwell = 1; T.extra = (T.extra || 0) + 1; }
      if (T.dwell <= 0) { T.extra = 0; snd.toot(); }
      return;
    }
    // prochaine gare : là où le premier wagon s'aligne sur le quai
    let dNext = Infinity;
    for (const s0 of S.STATIONS) { const d = (((s0.s + CAR_GAP[1]) - T.s) % total + total) % total; if (d > 0.05 && d < dNext) dNext = d; }
    const vmax = 11, want = Math.min(vmax, Math.sqrt(2 * 2.6 * dNext) + 0.4);
    T.v += clamp(want - T.v, -6 * dt, 3 * dt);
    const step = Math.min(T.v * dt, dNext);
    T.s = (T.s + step) % total;
    if (dNext - step < 0.02) { T.dwell = 5; T.v = 0; snd.whistle(false); }
    T.chug += T.v * dt;
    if (T.chug > 2.2) { T.chug = 0; if (Math.hypot(game.camera.position.x - trainCars[0].position.x, game.camera.position.z - trainCars[0].position.z) < 40) snd.chug(T.v / vmax); }
  }
  /** Le train pousse gentiment le chien qui est sur la voie. */
  function trainPush() {
    if (st.train.v < 1) return;
    for (const P of players()) {
      if (P.ride) continue;
      for (let c = 0; c < 3; c++) {
        const p = S.trackAt(st.train.s - CAR_GAP[c]);
        const dx = P.pos.x - p.x, dz = P.pos.z - p.z;
        const along = dx * Math.sin(p.yaw) + dz * Math.cos(p.yaw), side = dx * Math.cos(p.yaw) - dz * Math.sin(p.yaw);
        if (Math.abs(along) < 1.8 && Math.abs(side) < 1.4 && P.pos.y < p.y + 1.5) {
          const sgn = side >= 0 ? 1 : -1, push = 1.45 - Math.abs(side);
          P.pos.x += Math.cos(p.yaw) * sgn * push; P.pos.z -= Math.sin(p.yaw) * sgn * push;
          if (game.t - (st.tootAt || -9) > 3) { st.tootAt = game.t; snd.toot(); game.bubble({ pos: new THREE.Vector3(p.x, p.y + 2.6, p.z), small: true }, 'Tchou tchou !'); }
        }
      }
    }
  }

  // --- Lapins et canards ----------------------------------------------------------------------------
  function stepRabbits(dt) {
    for (const r of rabbits) {
      r.hop = Math.max(0, r.hop - dt);
      r.t -= dt;
      let near = null, nd = 7;
      for (const P of players()) { const d = Math.hypot(P.pos.x - r.x, P.pos.z - r.z); if (d < nd) { nd = d; near = P; } }
      if (r.hop <= 0 && (near || r.t <= 0)) {
        let a;
        if (near) a = Math.atan2(r.x - near.pos.x, r.z - near.pos.z) + (Math.random() - 0.5) * 0.8;
        else { a = Math.atan2(r.hx - r.x, r.hz - r.z) + (Math.random() - 0.5) * 2.5; r.t = 1.5 + Math.random() * 3; }
        r.yaw = a; r.hop = 0.45; r.vx = Math.sin(a) * (near ? 5 : 2.2); r.vz = Math.cos(a) * (near ? 5 : 2.2);
      }
      if (r.hop > 0) {
        const nx = r.x + r.vx * dt, nz = r.z + r.vz * dt;
        if (Math.hypot(nx - r.hx, nz - r.hz) < 14 && !S.blockedAt(nx, nz) && H(nx, nz) > 0.5) { r.x = nx; r.z = nz; }
      }
      r.y = H(r.x, r.z);
    }
  }
  function onBark(P) {
    if (Math.hypot(P.pos.x - S.POND.x, P.pos.z - S.POND.z) < S.POND.r + 8) setTimeout(() => { if (!game.disposed) snd.quack(); }, 300);
    for (const r of rabbits) if (Math.hypot(P.pos.x - r.x, P.pos.z - r.z) < 12) { r.hop = 0; r.t = 0; }
    // un « Ouaf ! » près d'une lanterne éteinte la rallume aussi
    for (const l of lanterns) if (Math.hypot(P.pos.x - l.def.x, P.pos.z - l.def.z) < 4 && Math.abs(P.pos.y - l.def.y) < 3) lightLantern(l);
  }

  // --- Conversations ---------------------------------------------------------------------------------
  function hints() {
    const p = park(), s = save(), out = [];
    if (!s.medals.includes('m_puppy') && game.puppy.state !== 'home') {
      out.push([
        'Mon Biscotte voulait voir les canards de la mare, à l\'ouest. Cherchez près de l\'eau !',
        'Son collier ! Alors suivez ses traces jusqu\'au bac à sable de l\'aire de jeux. Creusez là où ça sent le chiot !',
        'Son doudou ! Biscotte n\'est pas loin… Allez voir au manège, au nord-est du Grand Chêne.',
        game.puppy.state === 'follow' ? 'Ramenez-le-moi vite !' : 'Biscotte est dans le labyrinthe fleuri, au nord-ouest ! Trouvez le chemin jusqu\'au milieu.',
      ][Math.min(3, p.clues)]);
    }
    if (!s.medals.includes('m_tree') && p.lit.length < S.LANTERNS.length) {
      const l = S.LANTERNS.find(x => !p.lit.includes(x.id));
      out.push(p.lit.length ? `Il reste ${S.LANTERNS.length - p.lit.length} lanterne${S.LANTERNS.length - p.lit.length > 1 ? 's' : ''} à rallumer. Il y en a une ${l.where}.` : 'Les chats ont soufflé les six lanternes magiques du parc. Approchez-vous d\'une lanterne pour la rallumer ! Quand elles brilleront toutes, le Grand Chêne s\'illuminera.');
    }
    if (!s.medals.includes('m_crate') && !p.agility) out.push('Gaston, l\'entraîneur d\'agility, vous attend sur son terrain, à l\'est du Grand Chêne.');
    if (!s.medals.includes('m_cats') && catsLeft() > 0) out.push(`Encore ${catsLeft()} chat${catsLeft() > 1 ? 's' : ''} farceur${catsLeft() > 1 ? 's' : ''} dans le parc. Un gros « Ouaf ! » les fait déguerpir !`);
    if (!s.medals.includes('m_balls') && s.balls.length < 5) {
      const b = game.balls.find(x => !x.taken);
      out.push(s.balls.length ? `Encore ${5 - s.balls.length} balle${5 - s.balls.length > 1 ? 's' : ''} de tennis à trouver. Il y en a une ${b.def.where}.` : 'Cinq balles de tennis se sont perdues loin des chemins. Elles reviennent toutes seules sur le piédestal, à côté de la fontaine !');
    }
    if (out.length > 1 && game.t - (st.hint.scope || -999) > 300) { st.hint.scope = game.t; out.splice(1, 0, 'Si vous êtes perdus, montez au belvédère, tout au nord : la longue-vue montre tout le parc !'); }
    return out;
  }

  // =============================================================================
  // Interface avec le moteur
  // =============================================================================
  const logic = {
    moving, chars,
    park: { st, boats, lanterns, rabbits, state: park, swingSeats },   // (pour les tests)
    playerStep(P, wx, wz, jumpHeld, pr, dt) {
      if (!P.ride) return false;
      rideStep(P, wx, wz, jumpHeld, pr, dt);
      return true;
    },
    nearFor(Q) {
      if (!Q.ride) return undefined;
      if (Q.ride.kind === 'train' || Q.ride.kind === 'boat') return { kind: 'lv', act: 'exit', label: 'DESCENDRE', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y };
      return null;
    },
    extraCandidates(Q) {
      const p = park(), s = save(), out = [];
      out.push({ kind: 'lv', act: 'gaston', label: 'PARLER', x: S.npcs.gaston.x + 0.8, z: S.npcs.gaston.z, y: S.npcs.gaston.y });
      if (!s.intro) return out;
      out.push({ kind: 'lv', act: 'scope', label: 'REGARDER', x: S.TELESCOPE.x, z: S.TELESCOPE.z + 1, y: S.DECK.top });
      if (p.clues < 3 && game.puppy.state === 'lost') {
        const c = S.CLUES[p.clues];
        out.push({ kind: 'lv', act: 'clue', i: p.clues, label: c.act, x: c.x, z: c.z, y: c.y });
      }
      // le train à quai
      if (st.train.dwell > 0) {
        const taken = trainSeats();
        const free = [0, 1, 2, 3].find(i => !taken.includes(i));
        if (free !== undefined) for (const c of [1, 2]) { const p2 = S.trackAt(st.train.s - CAR_GAP[c]); out.push({ kind: 'lv', act: 'train', label: 'MONTER', x: p2.x, z: p2.z, y: p2.y + 0.5 }); }
      }
      for (const b of boats) if (b.driver < 0) out.push({ kind: 'lv', act: 'boat', b: b.id, label: 'MONTER', x: b.x, z: b.z, y: S.WATER_Y + 0.6 });
      const C = S.CAROUSEL, dc = Math.hypot(Q.pos.x - C.x, Q.pos.z - C.z);
      if (dc > C.r - 2.5 && dc < C.r + 2.2) {
        // le bord du manège le plus proche (un indice posé dessus passe avant)
        const k = (C.r + 0.4) / (dc || 1);
        out.push({ kind: 'lv', act: 'carousel', label: 'MONTER', x: C.x + (Q.pos.x - C.x) * k, z: C.z + (Q.pos.z - C.z) * k, y: C.floor });
      }
      swingSeats.forEach((sw, i) => { if (sw.rider < 0) out.push({ kind: 'lv', act: 'swing', i, label: 'BALANCER', x: sw.x, z: sw.z, y: S.PLAYGROUND.y }); });
      const Sl = S.SLIDE;
      if (Math.abs(Q.pos.x - Sl.x) < Sl.w / 2 + 0.3 && Math.abs(Q.pos.z - Sl.z) < Sl.d / 2 + 0.3 && Q.pos.y > Sl.top - 0.4) out.push({ kind: 'lv', act: 'slide', label: 'GLISSER', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y });
      return out;
    },
    interact(n, P) {
      if (n.act === 'gaston') talkGaston(P);
      else if (n.act === 'scope') lookScope(P);
      else if (n.act === 'clue') findClue(n.i);
      else if (n.act === 'exit') { if (P.ride && P.ride.kind === 'boat') exitBoat(P); else if (P.ride) exitTrain(P); }
      else if (n.act === 'train') {
        const taken = trainSeats(), free = [0, 1, 2, 3].find(i => !taken.includes(i));
        if (free === undefined) return;
        board(P, 'train', { seat: free });
        if (!park().rodeTrain) { park().rodeTrain = true; game.persist(); game.banner('En voiture !', 'Le petit train fait le tour du parc. Saut ou Parler : on descend.', 3000); }
        snd.toot();
      } else if (n.act === 'boat') {
        const b = boats[n.b];
        if (b.driver >= 0) return;
        b.driver = P.id === undefined ? 0 : P.id;
        board(P, 'boat', { b, camRate: 2.5 });
        game.banner('Pédalo-cygne !', 'Dirige-le sur la mare. Approche-toi du bord, puis Saut : on descend.', 2600);
      } else if (n.act === 'carousel') {
        const C = S.CAROUSEL;
        board(P, 'carousel', { a: Math.atan2(P.pos.z - C.z, P.pos.x - C.x) - st.carA });
        game.sound('trick');
      } else if (n.act === 'swing') {
        const sw = swingSeats[n.i];
        sw.rider = P.id === undefined ? 0 : P.id;
        board(P, 'swing', { i: n.i });
      } else if (n.act === 'slide') {
        board(P, 'slide', {});
        snd.whoosh();
      }
    },
    step(dt) {
      const t = game.t, PL = players(), p = park();
      // aboiements : les chats de la mission détalent pour de bon
      for (const P of PL) {
        const b = P.barkT || 0, was = st.lastBark.get(P) || 0;
        if (b > was + 0.3) onBark(P);
        st.lastBark.set(P, b);
      }
      for (const c of game.cats) if (!c.dead && c.def.group === 'clearing' && c.flee > 0) game.defeatCat(c);
      // drapeaux
      for (const P of PL) for (const c of S.CHECKPOINTS) if (!p.flags.includes(c.id) && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 3.2 && Math.abs(P.pos.y - c.y) < 3) raiseFlag(c);
      hidePuppyIfNeeded();
      if (save().intro) {
        // lanternes : on s'en approche, elles s'allument
        for (const l of lanterns) {
          if (p.lit.includes(l.def.id)) continue;
          for (const P of PL) if (Math.hypot(P.pos.x - l.def.x, P.pos.z - l.def.z) < 2.2 && Math.abs(P.pos.y - l.def.y) < 2.5) { lightLantern(l); break; }
        }
        // creuser dans le bac à sable : un coup de toupie (ou une charge) sur le petit tas
        if (p.clues === 1 && !game.dialog) for (const P of PL) if ((P.attackT > 0 || P.dashT > 0) && Math.hypot(P.pos.x - S.DIG.x, P.pos.z - S.DIG.z) < 2.2) { findClue(1); break; }
        stepRun(dt);
      }
      stepTrain(dt);
      trainPush();
      st.carA += dt * 0.55;
      stepRabbits(dt);
      // balançoires sans personne : elles s'arrêtent doucement
      for (const sw of swingSeats) if (sw.rider < 0) sw.a *= Math.max(0, 1 - dt * 1.2);
      for (const sw of swingSeats) if (sw.rider >= 0 && !PL.some(P => P.ride && P.ride.kind === 'swing' && swingSeats[P.ride.i] === sw)) sw.rider = -1;
      for (const b of boats) if (b.driver >= 0 && !PL.some(P => P.ride && P.ride.b === b)) b.driver = -1;
      // pédalos vides : ils dérivent doucement et s'arrêtent
      for (const b of boats) if (b.driver < 0 && Math.abs(b.speed) > 0.01) { b.speed *= Math.max(0, 1 - dt); const nx = b.x + Math.sin(b.yaw) * b.speed * dt, nz = b.z + Math.cos(b.yaw) * b.speed * dt; st.movingBoat = b; if (boatFree(nx, nz)) { b.x = nx; b.z = nz; } else b.speed = 0; st.movingBoat = null; }
      if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
        updateChips();
        const qt = logic.questText();
        if (qt !== st.quest) { st.quest = qt; game.updateHud(); }
      }
    },
    reveal() {
      const p = park(), s = save();
      return {
        m_tree: p.lit.length >= S.LANTERNS.length,
        m_cats: S.cats.filter(c => c.group === 'clearing').every(c => s.cats.includes(c.id)),
        m_crate: !!p.agility,
        m_balls: s.balls.length >= 5,
        m_puppy: s.puppy === 'home',
      };
    },
    applySave() {
      const s = save();
      // anciennes sauvegardes : les balles d'avant (autres endroits) ne comptent plus
      if (!s.medals.includes('m_balls')) {
        const ids = new Set(S.balls.map(b => b.id));
        const keep = s.balls.filter(id => ids.has(id));
        if (keep.length !== s.balls.length) {
          s.balls = keep;
          if (game.balls) for (const b of game.balls) { b.taken = keep.includes(b.def.id); b.mesh.visible = !b.taken; }
          (game.pedestalBalls || []).forEach((b, i) => { b.visible = i < keep.length; });
        }
      }
      if (s.puppy === 'home' && park().clues < 3) park().clues = 3;
      updateChips();
    },
    respawn(P) {
      if (P.ride) { if (P.ride.kind === 'boat') P.ride.b.driver = -1; if (P.ride.kind === 'swing') swingSeats[P.ride.i].rider = -1; P.ride = null; }
      const p = park();
      let best = null, bd = Infinity;
      for (const c of S.CHECKPOINTS) {
        if (!p.flags.includes(c.id)) continue;
        const d = Math.hypot(c.x - P.pos.x, c.z - P.pos.z);
        if (d < bd) { bd = d; best = c; }
      }
      if (!best || game.mode !== 'defi' && P.checkpoint && Math.hypot(P.checkpoint.x - P.pos.x, P.checkpoint.z - P.pos.z) < bd) return null;
      return { x: best.x + 1.5, y: best.y + 0.3, z: best.z + 1.5, yaw: Math.PI };
    },
    guideTarget(me) {
      const p = park(), s = save();
      if (me.ride && me.ride.kind === 'boat') {
        const b = game.balls.find(x => x.def.id === 'tb2');
        return b && !b.taken ? { x: S.ISLET.x, y: S.ISLET.top, z: S.ISLET.z } : { x: S.JETTY.x0, y: S.JETTY.top, z: S.JETTY.z };
      }
      if (st.run) { const o = COURSE[st.run.i]; return { x: o.x, y: o.y, z: o.z }; }
      if (game.puppy.state === 'follow') return null;
      if (game.medals.some(m => m.mesh.visible)) return null;
      // les indices de Biscotte d'abord
      if (game.puppy.state === 'lost') {
        if (p.clues < 3) return S.CLUES[p.clues];
        // dans le labyrinthe : le chemin passe par l'entrée
        const I = S.MAZE_INFO, half = I.N * I.C / 2, inMaze = Math.abs(me.pos.x - S.MAZE.x) < half + 1 && me.pos.z - S.MAZE.z > -half - 1 && me.pos.z - S.MAZE.z < half + (Math.abs(me.pos.x - I.entrance.x) < 3 ? 4 : 1);
        return inMaze ? mazeStep(me) : I.entrance;
      }
      // puis le plus proche de ce qui reste à faire
      const cand = [];
      for (const l of S.LANTERNS) if (!p.lit.includes(l.id)) cand.push(l);
      if (!s.medals.includes('m_balls')) for (const b of game.balls) if (!b.taken) cand.push(b.def.id === 'tb2' ? { x: S.JETTY.x1 + 1, y: S.JETTY.top, z: S.JETTY.z } : b.def);
      for (const c of game.cats) if (!c.dead && c.def.group === 'clearing') cand.push(c.pos);
      if (!p.agility) cand.push({ x: S.npcs.gaston.x + 1, y: S.npcs.gaston.y, z: S.npcs.gaston.z });
      let best = null, bd = Infinity;
      for (const c of cand) { const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < bd) { bd = d; best = c; } }
      return best;
    },
    questText() {
      const s = save(), p = park(), me = game.me;
      if (!s.intro) return 'Parle à Mamie Labrador';
      if (game.puppy && game.puppy.state === 'follow') return 'Ramène Biscotte à Mamie';
      if (st.run) return st.run.t < 0 ? 'Agility : prêts ?' : `Agility : ${COURSE[st.run.i].name} (${st.run.i + 1}/${COURSE.length})`;
      if (me && me.ride && me.ride.kind === 'train') return 'En voiture ! Saute pour descendre';
      if (me && me.ride && me.ride.kind === 'boat') return 'Pédalo : approche du bord pour descendre';
      if (s.medals.length >= 5) return 'Tu as tout trouvé, bravo !';
      const shown = game.medals && game.medals.find(m => m.mesh.visible);
      if (shown) return `Une médaille brille : ${shown.def.label.replace(/^L/, 'l')} !`;
      const near = (o, r) => me && Math.hypot(me.pos.x - o.x, me.pos.z - o.z) < r;
      if (!p.agility && near(S.AGILITY, 30)) return 'Parle à Gaston pour la course d\'agility';
      if (catsLeft() > 0 && game.cats.some(c => !c.dead && c.def.group === 'clearing' && near(c.pos, 16))) return `Chasse les chats farceurs (${catsLeft()})`;
      if (game.puppy.state === 'lost' && !s.medals.includes('m_puppy')) return ['Biscotte a disparu : cherche près de la mare', 'Suis les traces de Biscotte : le bac à sable', 'Suis la piste de Biscotte : le manège', 'Trouve Biscotte dans le labyrinthe fleuri'][Math.min(3, p.clues)];
      if (p.lit.length > 0 && p.lit.length < S.LANTERNS.length) return `Rallume les lanternes (${p.lit.length}/${S.LANTERNS.length})`;
      if (s.balls.length > 0 && s.balls.length < 5) return `Trouve les balles de tennis (${s.balls.length}/5)`;
      return `Trouve les Médailles Patounes (${s.medals.length}/5)`;
    },
    minimapMarks() {
      const p = park(), s = save(), out = [];
      const scope = game.t < st.scopeUntil;
      for (const l of S.LANTERNS) if (!p.lit.includes(l.id)) out.push([l.x, l.z, '#ffa040', 2.8, scope]);
      if (scope && !s.medals.includes('m_balls')) for (const b of game.balls) if (!b.taken) out.push([b.def.x, b.def.z, '#d8f040', 2.6, true]);
      if (scope) for (const c of game.cats) if (!c.dead && c.def.group === 'clearing') out.push([c.pos.x, c.pos.z, '#b0b0c0', 2.4, true]);
      if (s.intro && p.clues < 3 && game.puppy.state === 'lost') { const c = S.CLUES[p.clues]; out.push([c.x, c.z, '#8ad0ff', 3, scope]); }
      if (!p.agility) out.push([S.npcs.gaston.x, S.npcs.gaston.z, '#3a6ae0', 3.2]);
      if (st.run) { const o = COURSE[st.run.i]; out.push([o.x, o.z, '#ffd23a', 3.5, true]); }
      out.push([trainCars[0].position.x, trainCars[0].position.z, '#e0302a', 2.8]);
      for (const b of boats) out.push([b.x, b.z, '#ffffff', 2.2]);
      out.push([S.TELESCOPE.x, S.TELESCOPE.z, '#c8a040', 2.4]);
      return out;
    },
    snapshot() {
      const r = (x) => Math.round(x * 100) / 100;
      return {
        tr: [r(st.train.s), r(st.train.v), r(st.train.dwell)],
        bt: boats.map(b => [r(b.x), r(b.z), r(b.yaw), b.driver]),
        ca: r(st.carA),
        sw: swingSeats.map(sw => r(sw.a)),
        rn: st.run ? [st.run.P.id || 0, st.run.i, r(st.run.t)] : 0,
        rd: players().map(P => [P.id || 0, P.ride ? P.ride.kind : 0, P.ride ? r(P.ride.speed || 0) : 0, P.ride ? r(P.ride.yaw || 0) : 0]),
        rb: rabbits.map(o => [r(o.x), r(o.z), r(o.yaw), o.hop > 0 ? 1 : 0]),
      };
    },
    apply(x) {
      st.train.s = x.tr[0]; st.train.v = x.tr[1]; st.train.dwell = x.tr[2];
      x.bt.forEach((d, i) => { const b = boats[i]; if (!b) return; b.x = d[0]; b.z = d[1]; b.yaw = d[2]; b.driver = d[3]; });
      st.carA = x.ca;
      x.sw.forEach((a, i) => { if (swingSeats[i]) swingSeats[i].a = a; });
      if (x.rn) { const P = game.party.get(x.rn[0]) || game.player; st.run = Object.assign(st.run || {}, { P, i: x.rn[1], t: x.rn[2], guest: true }); } else if (st.run) stopRun();
      for (const [id, kind, sp, yaw] of x.rd) { const P = game.party.get(id); if (!P) continue; P.ride = kind ? { kind, speed: sp, yaw, camRate: 2.2, guest: true } : null; }
      x.rb.forEach((d, i) => { const o = rabbits[i]; if (!o) return; o.x = d[0]; o.z = d[1]; o.yaw = d[2]; if (d[3] && o.hop <= 0) o.hop = 0.45; o.y = H(o.x, o.z); });
    },
    talkMamie(first) {
      const s = save();
      const k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Ah ! Ainu ! Matcha ! Vous tombez à pic, mes toutous !' },
          { who: 'Mamie Labrador', text: 'La Capitaine Moustache et ses chats bandits ont volé les 5 Médailles Patounes du parc !' },
          { who: 'Matcha', text: 'Grrr… Ces chats vont nous entendre !' },
          { who: 'Ainu', text: 'Ouaf ! On va toutes les récupérer, Mamie !' },
          { who: 'Mamie Labrador', text: 'Et mon petit Biscotte a disparu… Il voulait voir les canards de la mare, à l\'ouest.' },
          { who: 'Mamie Labrador', text: 'Le parc est très grand, vous savez : la mare, l\'aire de jeux, le manège, le labyrinthe… et même un petit train !' },
          { who: 'Mamie Labrador', text: 'Suivez les os dorés, ils vous montreront le chemin !' },
          { who: 'Mamie Labrador', text: `${k.jump} pour sauter. Appuyez encore en l'air : Matcha vous propulse plus haut !` },
          { who: 'Mamie Labrador', text: `Gardez ${k.jump} appuyé en tombant : la queue d'Ainu fait l'hélice et vous planez !` },
          { who: 'Mamie Labrador', text: `${k.attack} : coup de queue tournoyant. ${k.dash} : Matcha fonce et casse les caisses !` },
          { who: 'Mamie Labrador', text: 'Si vous êtes perdus, revenez me voir : je vous donnerai un indice. Bonne chance, mes toutous !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Trouvez les 5 Médailles Patounes !', 2800); game.updateHud(); updateChips(); });
        return;
      }
      if (s.medals.length >= 5) { game.say([{ who: 'Mamie Labrador', text: 'Le parc est sauvé grâce à vous ! Profitez-en pour finir de ramasser les os dorés.' }]); return; }
      const left = 5 - s.medals.length;
      const h = hints();
      game.say([{ who: 'Mamie Labrador', text: `Il vous reste ${left} médaille${left > 1 ? 's' : ''} à trouver.` }, ...h.slice(0, 2).map(t => ({ who: 'Mamie Labrador', text: t }))]);
    },
    endLines() {
      const kid = window.kidName ? window.kidName() : '';
      return [
        { who: 'Mamie Labrador', text: 'Les 5 Médailles Patounes ! Le Parc des Toutous est sauvé !' },
        { who: 'Matcha', text: 'Ces chats bandits n\'avaient aucune chance !' },
        { who: 'Biscotte', text: 'Et moi, je ne me perdrai plus jamais ! … Enfin, presque jamais.' },
        { who: 'Mamie Labrador', text: 'Mais la Capitaine Moustache s\'est enfuie vers la Forêt des Moustaches…' },
        { who: 'Mamie Labrador', text: 'Ces médailles, c\'est mon Firmin qui les avait gagnées, quand il était jeune chien. Merci, mes trésors.' },
        { who: 'Ainu', text: 'Ouaf ! On la rattrapera, promis !' },
        { who: 'Mamie Labrador', text: 'Regardez : des poils de moustache… tout droit vers la Forêt des Moustaches !' },
        ...(kid ? [{ who: '', text: `Et tout ça, grâce à ${kid}.` }] : []),
      ];
    },
    render(dt, t) {
      const p = park(), cam = game.camera.position;
      // le décor lointain est caché (grand monde)
      const far0 = lite ? 150 : 230;
      for (const c of cull) c.obj.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < far0 + c.r;
      const seeIt = (x, z, r) => Math.hypot(x - cam.x, z - cam.z) < (r || (lite ? 120 : 180));
      // Biscotte reste caché tant que la piste n'est pas suivie
      if (game.puppy.state === 'lost' && p.clues < 3) { game.marks.puppy.visible = false; game.puppy.mesh.visible = false; }
      else game.puppy.mesh.visible = true;
      // le petit train
      trainCars.forEach((m, i) => {
        const pt = S.trackAt(st.train.s - CAR_GAP[i] - (i ? 0 : 0.3));
        const ah = S.trackAt(st.train.s - CAR_GAP[i] + 1), bh = S.trackAt(st.train.s - CAR_GAP[i] - 1);
        m.position.set(pt.x, pt.y + Math.abs(Math.sin(t * 9 + i)) * 0.02 * Math.min(1, st.train.v), pt.z);
        m.rotation.set(0, Math.atan2(ah.x - bh.x, ah.z - bh.z), 0);
        m.rotateX(-Math.atan2(ah.y - bh.y, 2));
        m.visible = seeIt(pt.x, pt.z);
      });
      if (st.train.v > 3 && Math.random() < dt * 8 && trainCars[0].visible) { const f = trainCars[0]; game.spawnParticle(f.position.x + Math.sin(f.rotation.y) * 1, f.position.y + 2.8, f.position.z + Math.cos(f.rotation.y) * 1, 0, 1.6, 0, 0xf4f4f4, 0.5, 1.2, -0.5); }
      // pédalos
      for (const b of boats) {
        b.m.position.set(b.x, S.WATER_Y - 0.12 + Math.sin(t * 1.6 + b.id) * 0.04, b.z);
        b.m.rotation.set(Math.sin(t * 1.3 + b.id) * 0.03, b.yaw, Math.sin(t * 1.1 + b.id * 2) * 0.03);
      }
      // canards : une maman, ses canetons, deux copines
      for (let i = 0; i < DUCKS; i++) {
        const R = i === 1 ? 6 : i === 2 ? 9.5 : 12, w = i === 1 ? -0.2 : i === 2 ? 0.14 : 0.12;
        const a = t * w + (i >= 3 ? -(i - 2) * 0.12 : i * 2.1);
        const x = S.POND.x + Math.cos(a) * R, z = S.POND.z + Math.sin(a) * R;
        const yaw = Math.atan2(-Math.sin(a) * Math.sign(w), Math.cos(a) * Math.sign(w));
        m4.compose(v3.set(x, S.WATER_Y - 0.02 + Math.sin(t * 2 + i) * 0.03, z), q.setFromEuler(e.set(0, yaw, Math.sin(t * 1.5 + i) * 0.06)), sv.setScalar(i >= 3 ? 0.55 : 1));
        duckI.setMatrixAt(i, m4);
      }
      duckI.instanceMatrix.needsUpdate = true;
      if (Math.random() < dt * 0.12 && seeIt(S.POND.x, S.POND.z, 32)) snd.quack();
      // manège
      carousel.rotation.y = -st.carA;
      horses.forEach((h, i) => { h.position.y = 1.3 + Math.sin(st.carA * 6 + i * 1.7) * 0.3; });
      if (seeIt(S.CAROUSEL.x, S.CAROUSEL.z, 16) && Math.floor(t * 3.2) !== Math.floor((t - dt) * 3.2)) snd.music(st.carMusic++);
      // balançoires
      for (const sw of swingSeats) sw.m.rotation.x = -sw.a;
      // la bascule d'agility penche sous le chien
      if (seesawPlank) {
        const o = COURSE.find(c => c.type === 'seesaw');
        let tilt = -0.18 * o.dir;
        for (const P of players()) if (P.onCol === o.col) tilt = clamp((P.pos.x - o.cx) / (o.len / 2), -1, 1) * 0.2;
        seesawPlank.rotation.z += (tilt - seesawPlank.rotation.z) * Math.min(1, dt * 5);
      }
      // l'obstacle suivant brille
      if (st.run && st.run.t >= 0) {
        const o = COURSE[st.run.i];
        gateGlow.visible = gateArrow.visible = true;
        gateGlow.position.set(o.x, o.y + 1.2, o.z);
        gateGlow.rotation.set(0, o.ax === 'x' ? Math.PI / 2 : 0, 0);
        if (o.type === 'table' || o.type === 'seesaw') gateGlow.rotation.set(Math.PI / 2, 0, 0);
        if (o.type === 'seesaw') gateGlow.position.set(o.cx, o.top + 0.3, o.z);
        if (o.type === 'table') gateGlow.position.y = o.top + 0.3;
        gateGlow.scale.setScalar(1 + Math.sin(t * 6) * 0.08);
        gateArrow.position.set(gateGlow.position.x, o.y + 3.6 + Math.sin(t * 4) * 0.25, gateGlow.position.z);
      } else { gateGlow.visible = false; gateArrow.visible = false; }
      // Gaston regarde les chiens, sa queue bat la mesure
      {
        const me = game.me, gu = gaston.userData;
        const close = Math.hypot(me.pos.x - gaston.position.x, me.pos.z - gaston.position.z) < 14;
        const want = close ? clamp(angDiff(Math.atan2(me.pos.x - gaston.position.x, me.pos.z - gaston.position.z), gaston.rotation.y), -1, 1) : 0;
        if (gu.mhead) { gu.mhead.rotation.y += (want - gu.mhead.rotation.y) * Math.min(1, dt * 3); gu.mhead.rotation.x = game.dialog && game.dom.dname.textContent === 'Gaston' ? Math.sin(t * 9) * 0.08 : 0; }
        if (gu.mtail) gu.mtail.rotation.z = Math.sin(t * (st.run ? 14 : 5)) * 0.4;
        if (st.run && gu.matcha) gu.matcha.position.y = gu.matchaY0 + Math.abs(Math.sin(t * 8)) * 0.08;
      }
      // lanternes
      for (const l of lanterns) {
        const lit = p.lit.includes(l.def.id), k = lit ? 1 : 0;
        l.glass.material.emissive.setHex(lit ? 0xffa030 : 0x000000);
        l.glass.material.emissiveIntensity = lit ? 1.6 + Math.sin(t * 3 + l.def.x) * 0.25 : 0;
        l.glass.material.color.setHex(lit ? 0xffe0a0 : 0x8a8478);
        l.halo.material.opacity = k * (0.55 + Math.sin(t * 2.5 + l.def.z) * 0.1) + (lit ? 0 : 0.0);
        l.halo.visible = lit && l.g.visible;
        if (!lit && save().intro && Math.random() < dt * 1.5 && seeIt(l.def.x, l.def.z, 60)) game.spawnParticle(l.def.x + (Math.random() - 0.5) * 0.6, l.def.y + 2.6, l.def.z + (Math.random() - 0.5) * 0.6, 0, 0.5, 0, 0xffd080, 0.18, 1.0, -0.3);
      }
      oakLamps.forEach((g, i) => { const on = i < p.lit.length; g.material.emissive.setHex(on ? 0xffa030 : 0); g.material.emissiveIntensity = on ? 1.8 : 0; g.material.color.setHex(on ? 0xffe0a0 : 0x9a9080); });
      // indices de Biscotte
      const ci = p.clues, lost = game.puppy.state === 'lost' && save().intro;
      clueMesh[0].visible = lost && ci === 0;
      clueMesh[0].rotation.y = t * 0.6;
      clueMesh[1].visible = ci === 1 && st.digAt !== undefined && t - st.digAt < 6;
      if (clueMesh[1].visible) clueMesh[1].position.y = H(S.DIG.x, S.DIG.z) + Math.min(1, (t - st.digAt) * 2) * 0.6;
      clueMesh[2].visible = lost && ci === 2;
      clueMesh[2].rotation.y = t * 0.8;
      mound.visible = ci <= 1;
      mound.scale.setScalar(ci === 1 && lost ? 1 + Math.sin(t * 5) * 0.05 : 0.8);
      const cl = lost && ci < 3 ? S.CLUES[ci] : null;
      clueMark.visible = !!cl && (ci !== 1 || st.digAt === undefined);
      if (cl) {
        clueMark.position.set(cl.x, cl.y + 1.6 + Math.sin(t * 4) * 0.1, cl.z);
        if (Math.random() < dt * 6) game.spawnParticle(cl.x + (Math.random() - 0.5) * 1.2, cl.y + 0.3, cl.z + (Math.random() - 0.5) * 1.2, 0, 0.8, 0, 0x8ad0ff, 0.16, 0.8, -0.2);
      }
      // lapins
      rabbits.forEach((r, i) => {
        const hop = r.hop > 0 ? Math.sin((0.45 - r.hop) / 0.45 * Math.PI) * 0.4 : 0;
        m4.compose(v3.set(r.x, r.y + hop, r.z), q.setFromEuler(e.set(0, r.yaw, 0)), sv.setScalar(1.15));
        rabbitI.setMatrixAt(i, m4);
      });
      rabbitI.instanceMatrix.needsUpdate = true;
      // drapeaux
      flags.forEach((fl, i) => {
        if (!fl.f.visible) return;
        const up = p.flags.includes(fl.def.id) ? 1 : 0;
        fl.raise += (up - fl.raise) * Math.min(1, dt * 3);
        fl.u.cloth.position.y = 1.0 + fl.raise * 2.25;
        const arr = fl.u.cloth.geometry.attributes.position.array, base = fl.u.base;
        for (let j = 0; j < arr.length; j += 3) arr[j + 2] = Math.sin(base[j] * 3 - t * 6 + i) * 0.12 * base[j];
        fl.u.cloth.geometry.attributes.position.needsUpdate = true;
        const since = t - fl.raisedAt;
        fl.u.halo.material.opacity = since < 1.5 ? (1 - since / 1.5) * 0.8 : 0;
        fl.u.halo.scale.setScalar(since < 1.5 ? 1 + since * 2 : 1);
      });
      // à bord : les chiens assis (pas de course dans le vide)
      for (const P of players()) {
        if (!P.ride || !P.mesh) continue;
        const u = P.mesh.userData;
        if (u.legs) u.legs.forEach((l) => { l.rotation.x = 0; });
      }
      // tout en haut du Grand Chêne : la caméra passe au-dessus du feuillage (sinon on ne voit que des feuilles)
      const me = game.me;
      const onTop = me.pos.y > S.TREE_TOP - 1.2 && Math.hypot(me.pos.x - S.TREE.x, me.pos.z - S.TREE.z) < 5.5;
      if (onTop) {
        if (st.pitch0 === undefined) st.pitch0 = game.camPitch;
        game.camPitch += (0.95 - game.camPitch) * Math.min(1, dt * 3);
        game.camDistOverride = 7;
      } else if (st.pitch0 !== undefined) { game.camPitch = st.pitch0; st.pitch0 = undefined; game.camDistOverride = 0; }
      if (me.ride && me.ride.kind === 'carousel' && game.t - game.lastCamManual > 1) game.camYaw = lerpAngle(game.camYaw, Math.atan2(me.pos.x - S.CAROUSEL.x, me.pos.z - S.CAROUSEL.z), Math.min(1, dt * 1.5));
    },
  };
  // état initial d'après la sauvegarde
  logic.applySave();
  return logic;

  // --- dans le labyrinthe : la case suivante sur le chemin vers le centre (pour les étincelles)
  function mazeStep(me) {
    const I = S.MAZE_INFO, N = I.N, C = I.C;
    const cc = clamp(Math.floor((me.pos.x - I.x0) / C), 0, N - 1), rr = clamp(Math.floor((me.pos.z - I.z0) / C), 0, N - 1);
    const id = (c, r) => c + ',' + r, key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    // parcours en largeur depuis le centre
    const prev = new Map([[id(I.mid, I.mid), null]]), qq = [[I.mid, I.mid]];
    while (qq.length) {
      const [c, r] = qq.shift();
      for (const [a, b] of [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]]) {
        if (a < 0 || b < 0 || a >= N || b >= N || prev.has(id(a, b)) || !I.open.has(key(id(c, r), id(a, b)))) continue;
        prev.set(id(a, b), [c, r]); qq.push([a, b]);
      }
    }
    const nx = prev.get(id(cc, rr));
    if (!nx) return I.center;
    const p = I.cellAt(nx[0], nx[1]);
    return { x: p.x, y: H(p.x, p.z), z: p.z };
  }
}
