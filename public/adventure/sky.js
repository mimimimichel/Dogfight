/*
 * Matcha & Ainu — Niveau 4 « Les Îles du Ciel » : décor et règles du parcours
 * (îles flottantes, plates-formes mobiles, nuages fragiles, colonnes de vent,
 * Pont des Copains, drapeaux, chrono). Le moteur commun est dans game.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as W from './world.js';
import * as RT from './realtex.js';
import { buildSkyBoss } from './sky_boss.js';
import { Cinema } from './cinema.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
function hash3(x, y, z) { const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a, b, k) => a + (b - a) * k;
  const c = (dx, dy, dz) => hash3(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
const fbm = (x, y, z) => vnoise(x, y, z) * 0.6 + vnoise(x * 2.1, y * 2.1, z * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3, z * 4.3) * 0.1;

/** Ajoute une couleur uniforme (ou calculée) à une géométrie non indexée. */
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    if (typeof color === 'function') color(c, g.attributes.position.getX(i), g.attributes.position.getY(i), g.attributes.position.getZ(i));
    else c.set(color);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/** Fusionne des géométries (non indexées) en gardant position, normale, couleur et uv. */
function mergeRaw(list) {
  const gs = list.map(g => (g.index ? g.toNonIndexed() : g));
  const out = new THREE.BufferGeometry();
  for (const [name, n] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) {
    if (!gs.every(g => g.attributes[name])) continue;
    const arr = new Float32Array(gs.reduce((a, g) => a + g.attributes[name].count * n, 0));
    let o = 0;
    for (const g of gs) { arr.set(g.attributes[name].array, o); o += g.attributes[name].count * n; }
    out.setAttribute(name, new THREE.BufferAttribute(arr, n));
  }
  out.computeBoundingSphere();
  return out;
}

/** Pièce du ciel : une petite étoile dorée et bombée. */
export function starCoinGeometry() {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.12 : 0.27;
    if (i) s.lineTo(Math.cos(a) * r, Math.sin(a) * r); else s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2 });
  g.center();
  return g;
}

// ---------------------------------------------------------------------------
// Îles flottantes : dessus herbeux bombé, dessous de roche en strates
// ---------------------------------------------------------------------------
const ROCK_BANDS = [0xc9a98a, 0xb08a70, 0x9a7a6a, 0x8a6e68, 0x7a6478, 0x6a5a72];
function islandMeshes(I, seed, lite) {
  const r = rng(seed);
  const top = I.top, R = I.r;
  // dessous : profil tourné, déformé par du bruit
  const depth = R * (1.35 + r() * 0.35);
  const prof = [];
  const N = 9;
  for (let i = 0; i <= N; i++) {
    const k = i / N;
    const rad = R * (1.0 - Math.pow(k, 1.6) * 0.98) * (1 + Math.sin(k * 7 + seed) * 0.05);
    prof.push(new THREE.Vector2(Math.max(0.05, rad), -k * depth));
  }
  const under = new THREE.LatheGeometry(prof, lite ? 18 : 30).toNonIndexed();
  const p = under.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const d = Math.hypot(x, z) || 1;
    const n = fbm(x * 0.35 + seed, y * 0.35, z * 0.35) - 0.5;
    const k = 1 + n * 0.45 * clamp(-y / 1.5, 0, 1);
    p.setX(i, x * k); p.setZ(i, z * k);
    p.setY(i, y + (fbm(x * 0.2, y * 0.2 + 9, z * 0.2) - 0.5) * 1.2 * clamp(-y / 2, 0, 1));
    void d;
  }
  under.computeVertexNormals();
  paint(under, (c, x, y, z) => {
    const band = Math.floor((-y + fbm(x * 0.3, 0, z * 0.3) * 1.6) / 1.35);
    c.set(ROCK_BANDS[clamp(band, 0, ROCK_BANDS.length - 1)]);
    c.multiplyScalar(0.92 + hash3(Math.floor(x * 2), Math.floor(y * 2), Math.floor(z * 2)) * 0.12);
    if (y > -0.9) c.lerp(new THREE.Color(0x5aa040), clamp((y + 0.9) / 0.9, 0, 1) * 0.85);   // mousse au bord
  });
  // coordonnées de texture : la roche garde la même échelle quelle que soit l'île
  const uv = under.attributes.uv;
  if (uv) for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * R * 6.28 / 6, uv.getY(i) * depth / 5);
  under.translate(I.x, top - 0.25, I.z);
  // dessus : disque bombé (suit heightAt), bord arrondi
  const rings = lite ? 6 : 10, segs = lite ? 24 : 40;
  const pos = [], col = [];
  const cTop = new THREE.Color(), cA = new THREE.Color(0x4e8c30), cB = new THREE.Color(0x7aa440), cC = new THREE.Color(0x3a6c24);
  const vert = (ri, si) => {
    const k = ri / rings, a = (si / segs) * Math.PI * 2;
    const rr = R * k * (1 + (fbm(Math.cos(a) * 2 + seed, 0, Math.sin(a) * 2) - 0.5) * 0.06 * k);
    const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr;
    const y = top + 0.35 * (1 - k * k) - (k > 0.96 ? 0.15 : 0);
    const n = fbm(x * 0.15, 3, z * 0.15);
    cTop.copy(cA).lerp(cB, clamp((n - 0.35) * 2.2, 0, 1)).lerp(cC, clamp((0.45 - n) * 2, 0, 1) * 0.5);
    return [x, y, z, cTop.r, cTop.g, cTop.b];
  };
  for (let ri = 0; ri < rings; ri++) for (let si = 0; si < segs; si++) {
    const a = vert(ri, si), b = vert(ri + 1, si), c = vert(ri + 1, si + 1), d = vert(ri, si + 1);
    for (const v of (ri === 0 ? [a, c, b] : [a, c, b, a, d, c])) { pos.push(v[0], v[1], v[2]); col.push(v[3], v[4], v[5]); }
  }
  const topGeo = new THREE.BufferGeometry();
  topGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  topGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  topGeo.computeVertexNormals();
  const tp = topGeo.attributes.position, tuv = new Float32Array(tp.count * 2);
  for (let i = 0; i < tp.count; i++) { tuv[i * 2] = tp.getX(i) / 3; tuv[i * 2 + 1] = tp.getZ(i) / 3; }
  topGeo.setAttribute('uv', new THREE.BufferAttribute(tuv, 2));
  return { under, top: topGeo, depth };
}

/** Petite île de pierre (plates-formes) : même style, en plus simple. */
function padGeometry(rad, seed, look) {
  const r = rng(seed);
  const parts = [];
  if (look === 'crystal') {
    const g = new THREE.CylinderGeometry(rad, rad * 0.55, 0.9, 6, 1);
    g.translate(0, -0.45, 0);
    parts.push(paint(g, 0x9ad8f8));
    const tip = new THREE.ConeGeometry(rad * 0.5, 1.4, 6); tip.rotateX(Math.PI); tip.translate(0, -1.6, 0);
    parts.push(paint(tip, 0x7ab8f0));
    return M.mergeGeos(parts.map(g => ({ geo: g })));
  }
  const depth = rad * (1.2 + r() * 0.4);
  const prof = [new THREE.Vector2(rad, 0), new THREE.Vector2(rad * 1.04, -0.3), new THREE.Vector2(rad * 0.8, -depth * 0.45), new THREE.Vector2(rad * 0.35, -depth * 0.85), new THREE.Vector2(0.05, -depth)];
  const g = new THREE.LatheGeometry(prof, 14).toNonIndexed();
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = 1 + (fbm(x + seed, y, z) - 0.5) * 0.5 * clamp(-y, 0, 1);
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  parts.push(paint(g, (c, x, y) => { c.set(ROCK_BANDS[clamp(Math.floor(-y / 0.8), 0, 5)]); if (y > -0.35) c.set(0x5aa040); }));
  const cap = new THREE.CylinderGeometry(rad * 0.98, rad * 1.02, 0.22, 20);
  cap.translate(0, -0.08, 0);
  parts.push(paint(cap, 0x7ad058));
  return M.mergeGeos(parts.map(g2 => ({ geo: g2 })));
}

/** Nuage (plate-forme moelleuse) : grappe de boules. */
function cloudGeometry(rad, seed) {
  const r = rng(seed);
  const parts = [];
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.4, d = rad * (0.45 + r() * 0.25), s = rad * (0.45 + r() * 0.2);
    const g = new THREE.IcosahedronGeometry(s, 2);
    g.scale(1, 0.62, 1);
    g.translate(Math.cos(a) * d, -0.32, Math.sin(a) * d);
    parts.push(g);
  }
  const mid = new THREE.IcosahedronGeometry(rad * 0.75, 2); mid.scale(1, 0.55, 1); mid.translate(0, -0.25, 0);
  parts.push(mid);
  return M.mergeGeos(parts.map(g => ({ geo: paint(g, (c, x, y) => c.set(0xffffff).lerp(new THREE.Color(0xd8d0f0), clamp(-y * 0.9, 0, 1))) })));
}

/** Nuage-mouton : un nuage tout rond avec une tête noire, des oreilles et de petites pattes. */
function sheepModel(rad, seed, standing) {
  const g = new THREE.Group();
  const wool = new THREE.Mesh(cloudGeometry(rad, seed), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.14 }));
  wool.castShadow = true; g.add(wool);
  const dark = 0x3a3238;
  const parts = [
    { geo: paint(new THREE.SphereGeometry(rad * 0.32, 12, 10), dark), y: -0.35, z: rad * 0.95, sz: 1.15 },
    ...[-1, 1].map(sx => ({ geo: paint(new THREE.SphereGeometry(rad * 0.13, 8, 6), dark), x: sx * rad * 0.3, y: -0.2, z: rad * 0.95, sx: 1.6, sy: 0.6, sz: 0.8 })),
    ...[-1, 1].map(sx => ({ geo: paint(new THREE.SphereGeometry(rad * 0.07, 8, 6), 0xffffff), x: sx * rad * 0.12, y: -0.25, z: rad * 1.26 })),
    ...[-1, 1].map(sx => ({ geo: paint(new THREE.SphereGeometry(rad * 0.035, 6, 4), 0x111111), x: sx * rad * 0.12, y: -0.25, z: rad * 1.31 })),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) => ({ geo: paint(new THREE.CylinderGeometry(rad * 0.08, rad * 0.06, standing ? rad * 0.5 : rad * 0.3, 6), dark), x: sx * rad * 0.38, y: standing ? -0.7 - rad * 0.25 : -0.75, z: sz * rad * 0.38 })),
  ];
  const face = new THREE.Mesh(M.mergeGeos(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  g.add(face);
  g.userData.face = face;
  return g;
}
/** Fleur-trampoline : une grosse fleur dont le cœur fait ressort. */
function flowerGeometry(rad, hue) {
  const parts = [{ geo: paint(new THREE.CylinderGeometry(0.12, 0.16, 0.5, 6), 0x4a9a3a), y: 0.25 }];
  for (let k = 0; k < 7; k++) {
    const a = k / 7 * Math.PI * 2, g = new THREE.SphereGeometry(rad * 0.42, 10, 6);
    parts.push({ geo: paint(g, (c, x, y) => c.setHSL(hue, 0.75, 0.62 + y * 0.4)), x: Math.cos(a) * rad * 0.62, y: 0.55, z: Math.sin(a) * rad * 0.62, sy: 0.32, ry: -a });
  }
  parts.push({ geo: paint(new THREE.SphereGeometry(rad * 0.42, 12, 8), 0xffd23a), y: 0.62, sy: 0.4 });
  return M.mergeGeos(parts);
}

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function puffTexture() {
  return canvasTex(128, 128, (x) => {
    const r = rng(5);
    for (let i = 0; i < 26; i++) {
      const px = 30 + r() * 68, py = 40 + r() * 46, rad = 14 + r() * 22;
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
    }
  });
}
function pawTexture(gold) {
  return canvasTex(128, 128, (x) => {
    x.fillStyle = gold ? '#ffd23a' : '#d8ccb8'; x.fillRect(0, 0, 128, 128);
    x.fillStyle = gold ? '#a86a00' : '#8a7a68';
    x.beginPath(); x.ellipse(64, 78, 24, 20, 0, 0, 7); x.fill();
    for (const [px, py] of [[32, 50], [50, 32], [78, 32], [96, 50]]) { x.beginPath(); x.ellipse(px, py, 10, 12, 0, 0, 7); x.fill(); }
  });
}
function flagTexture() {
  return canvasTex(128, 64, (x) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#e8483a'; x.fillRect(0, 0, 128, 10); x.fillRect(0, 54, 128, 10);
    x.fillStyle = '#e8483a';
    x.beginPath(); x.ellipse(64, 38, 11, 9, 0, 0, 7); x.fill();
    for (const [px, py] of [[48, 26], [57, 19], [71, 19], [80, 26]]) { x.beginPath(); x.ellipse(px, py, 4.5, 5.5, 0, 0, 7); x.fill(); }
  });
}
function streakTexture() {
  return canvasTex(64, 256, (x) => {
    const r = rng(9);
    x.clearRect(0, 0, 64, 256);
    for (let i = 0; i < 18; i++) {
      const px = r() * 64, py = r() * 256, len = 30 + r() * 70;
      const g = x.createLinearGradient(0, py, 0, py + len);
      g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.5, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = g; x.fillRect(px, py, 2 + r() * 2, len);
    }
  });
}

// ---------------------------------------------------------------------------
export function buildSky(game) {
  const sc = game.scene, S = L, lite = game.lite;
  const moving = [], chars = [];
  const save = () => game.save;
  const sky = () => {
    const s = save(); if (!s.sky) s.sky = {}; const k = s.sky;
    if (k.cp === undefined) k.cp = 0;
    // drapeaux déjà levés (les anciennes parties ne gardaient que le dernier, sur le chemin principal)
    if (!Array.isArray(k.flags)) k.flags = S.MAIN_PATH.filter(id => id <= k.cp);
    if (!Array.isArray(k.bells)) k.bells = [];
    if (!Array.isArray(k.feathers)) k.feathers = [];
    if (!Array.isArray(k.defis)) k.defis = [];
    return k;
  };
  const st = {
    cp: sky().cp, bridge: sky().bridge ? 'on' : 'off', bridgeUntil: 0, bridgeK: sky().bridge ? 1 : 0,
    rib: Object.fromEntries(S.RIBBONS.map(R => [R.id, 0])), ringT: {}, gust: S.GUSTS.map(() => 0),
    crumble: S.crumbles.map(() => ({ s: 'idle', t: 0 })),
    plates: S.PLATES.map(() => false), plateHintT: -9, soloHint: false,
    runT: 0, running: false, finished: false,
  };

  const std = (opts) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9 }, opts || {}));
  const rockMat = std({ roughness: 0.95 });
  const grassMat = std({ roughness: 1 });
  // rendu réaliste : roche en strates et herbe, avec relief
  let islandRock = rockMat, islandGrass = grassMat;
  if (W.LOOK.real && RT.hasPhotos()) {
    const rt = RT.photo('mossy_rock', 1);
    islandRock = std({ roughness: 0.95, map: rt.map, normalMap: rt.normalMap });
    const gt = RT.photoGray('leafy_grass', 1);
    islandGrass = std({ roughness: 1, map: gt.map, normalMap: gt.normalMap });
  } else if (W.LOOK.real) {
    const rt = RT.rockTex();
    islandRock = std({ roughness: 0.95, map: rt.map, normalMap: rt.normalMap });
    const gt = W.grassGroundTexture(); gt.repeat.set(1, 1);
    islandGrass = std({ roughness: 1, map: gt, normalMap: RT.normalFor(gt, 2) });
  }

  // --- îles -------------------------------------------------------------------------
  const unders = [], tops = [];
  // les îles sont regroupées par quartier (deux objets par quartier : roche et herbe)
  const quarters = new Map();
  S.ISLANDS.forEach((I, i) => {
    const g = islandMeshes(I, 11 + i * 7, lite);
    const key = Math.floor(I.x / 70) + ':' + Math.floor(I.z / 70);
    if (!quarters.has(key)) quarters.set(key, { under: [], top: [] });
    quarters.get(key).under.push(g.under); quarters.get(key).top.push(g.top);
    // racines qui pendent sous l'île
    const r = rng(40 + i);
    for (let k = 0; k < Math.round(I.r * 0.8); k++) {
      const a = r() * Math.PI * 2, d = I.r * (0.55 + r() * 0.35), len = 1.5 + r() * I.r * 0.35;
      const root = paint(new THREE.CylinderGeometry(0.05, 0.12, len, 5).translate(0, -len / 2, 0), 0x6a5040);
      unders.push({ geo: root, x: I.x + Math.cos(a) * d, y: I.top - 0.8 - r() * 1.5, z: I.z + Math.sin(a) * d, rz: (r() - 0.5) * 0.3 });
    }
  });
  for (const q of quarters.values()) {
    for (const [list, mat] of [[q.under, islandRock], [q.top, islandGrass]]) {
      const m = new THREE.Mesh(mergeRaw(list), mat);
      m.receiveShadow = true; m.castShadow = mat === islandRock && !lite;
      sc.add(m);
    }
  }
  const underMesh = new THREE.Mesh(M.mergeGeos(unders), rockMat);
  underMesh.castShadow = !lite; underMesh.receiveShadow = true;
  sc.add(underMesh);
  void tops;

  // cascades qui tombent de l'île du départ et de l'île du trophée
  for (const [I, a] of [[S.ISLANDS[0], -0.9], [S.ISLANDS[0], 3.6], [S.ISLANDS.find(q => q.id === 'goal'), 2.2]]) {
    const fall = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 28, 1, 8), new THREE.MeshBasicMaterial({ map: game.fallTex, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
    fall.position.set(I.x + Math.cos(a) * (I.r + 0.15), I.top - 13.8, I.z + Math.sin(a) * (I.r + 0.15));
    fall.rotation.y = -a + Math.PI / 2;
    fall.userData.noOutline = true;
    sc.add(fall);
    const spring = new THREE.Mesh(new THREE.CircleGeometry(1.2, 16), new THREE.MeshStandardMaterial({ color: 0x8ae0ff, roughness: 0.2, transparent: true, opacity: 0.85 }));
    spring.rotation.x = -Math.PI / 2;
    spring.position.set(I.x + Math.cos(a) * (I.r - 1.3), S.heightAt(I.x + Math.cos(a) * (I.r - 1.3), I.z + Math.sin(a) * (I.r - 1.3)) + 0.05, I.z + Math.sin(a) * (I.r - 1.3));
    spring.userData.noOutline = true;
    sc.add(spring);
  }

  // --- pierres flottantes ----------------------------------------------------------
  const padGeos = [], crystalGeos = [];
  const cloudPads = [];
  S.pads.forEach((p, i) => {
    if (p.look === 'cloud') { cloudPads.push({ geo: cloudGeometry(p.r, 600 + i), x: p.x, y: p.top, z: p.z }); return; }
    padGeos.push({ geo: padGeometry(p.r, 70 + i), x: p.x, y: p.top, z: p.z });
    // pierres « de cristal » : des éclats bleus plantés au bord (décor, on marche entre eux)
    if (p.look === 'crystal') for (let k = 0; k < 3; k++) {
      const a = k * 2.1 + i, h = 0.7 + (k % 2) * 0.4, g = new THREE.OctahedronGeometry(0.22, 0);
      g.scale(1, h / 0.22 * 0.5, 1); g.translate(0, h * 0.4, 0);
      crystalGeos.push({ geo: g, x: p.x + Math.cos(a) * p.r * 0.82, y: p.top - 0.05, z: p.z + Math.sin(a) * p.r * 0.82, rz: (k - 1) * 0.25 });
    }
  });
  const padMesh = new THREE.Mesh(M.mergeGeos(padGeos), rockMat);
  padMesh.castShadow = true; padMesh.receiveShadow = true;
  sc.add(padMesh);
  if (crystalGeos.length) {
    const cm = new THREE.Mesh(M.mergeGeos(crystalGeos), new THREE.MeshStandardMaterial({ color: 0xa8e0ff, roughness: 0.2, metalness: 0.1, emissive: 0x3a7ad0, emissiveIntensity: 0.6, flatShading: true }));
    cm.castShadow = true; sc.add(cm);
  }

  // --- plates-formes mobiles -------------------------------------------------------
  const runeMat = new THREE.MeshBasicMaterial({ color: 0x7af0ff, transparent: true, opacity: 0.85 });
  const cloudMat = std({ roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.12 });
  if (cloudPads.length) { const cpm = new THREE.Mesh(M.mergeGeos(cloudPads), cloudMat); cpm.castShadow = !lite; sc.add(cpm); }
  const movers = S.movers.map((m, i) => {
    let mesh;
    if (m.look === 'cloud') mesh = new THREE.Mesh(cloudGeometry(m.r, 90 + i), cloudMat);
    else if (m.look === 'sheep') mesh = sheepModel(m.r, 95 + i, false);
    else {
      mesh = new THREE.Group();
      const body = new THREE.Mesh(padGeometry(m.r, 120 + i), rockMat);
      body.castShadow = true;
      mesh.add(body);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(m.r * 0.72, 0.07, 6, 32), runeMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = -1.0;
      ring.userData.noOutline = true;
      mesh.add(ring);
    }
    mesh.castShadow = true;
    sc.add(mesh); moving.push(mesh);
    return { def: m, mesh };
  });

  // --- nuages fragiles -------------------------------------------------------------
  const crumbleMat = std({ roughness: 1, emissive: 0xffe0f0, emissiveIntensity: 0.15, transparent: true });
  const crumbles = S.crumbles.map((c, i) => {
    const mesh = new THREE.Mesh(cloudGeometry(c.r, 140 + i), crumbleMat.clone());
    mesh.position.set(c.x, c.top, c.z);
    sc.add(mesh); moving.push(mesh);
    return { def: c, mesh };
  });

  // --- champignons-ressorts --------------------------------------------------------
  const trampMat = std({ roughness: 1, emissive: 0xff9ad0, emissiveIntensity: 0.22, color: 0xffe4f2 });
  const trampRingMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.25 });
  const flowerMat = std({ roughness: 0.6 });
  const springs = S.springs.map((s, i) => {
    const g = new THREE.Group();
    if (s.look === 'flower') {
      const fl = new THREE.Mesh(flowerGeometry(s.r * 1.2, [0.92, 0.12, 0.78, 0.55, 0.02, 0.85, 0.15][i % 7]), flowerMat);
      fl.castShadow = !lite; g.add(fl);
      g.position.set(s.x, s.base, s.z);
      sc.add(g);
      return { def: s, g, cap: [fl] };
    }
    if (s.look === 'tramp') {
      // nuage-trampoline : un gros nuage rose, cerclé d'un anneau arc-en-ciel
      const puff = new THREE.Mesh(cloudGeometry(s.r * 1.05, 700 + i), trampMat);
      puff.position.y = 0.7; puff.castShadow = !lite; g.add(puff);
      const ringG = paint(new THREE.TorusGeometry(s.r * 0.98, 0.11, 6, 36), (c, x, y, z) => c.setHSL((Math.atan2(z, x) / (Math.PI * 2) + 1) % 1, 0.85, 0.62));
      const ring = new THREE.Mesh(ringG, trampRingMat);
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.42; ring.userData.noOutline = true; g.add(ring);
      g.position.set(s.x, s.base, s.z);
      sc.add(g);
      return { def: s, g, cap: [puff, ring] };
    }
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.42, 0.7, 10), M.mat(0xfff4e0));
    stalk.position.y = 0.35; g.add(stalk);
    const capG = new THREE.SphereGeometry(s.r, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    capG.scale(1, 0.55, 1);
    const cap = new THREE.Mesh(capG, M.mat(0xff5a9a, { roughness: 0.45 }));
    cap.position.y = 0.55; g.add(cap);
    const dots = new THREE.Mesh(M.mergeGeos([0, 1, 2, 3, 4].map(k => { const a = k * 1.26 + i, d = s.r * 0.55; return { geo: new THREE.SphereGeometry(0.13, 8, 6), x: Math.cos(a) * d, y: 0.55 + Math.sqrt(Math.max(0, s.r * s.r - d * d)) * 0.55 - 0.02, z: Math.sin(a) * d, sy: 0.5 }; })), M.mat(0xffffff));
    g.add(dots);
    g.position.set(s.x, s.base, s.z);
    sc.add(g);
    return { def: s, g, cap: [cap, dots] };
  });

  // --- colonnes de vent ------------------------------------------------------------
  const streak = streakTexture();
  streak.wrapS = streak.wrapT = THREE.RepeatWrapping;
  const drafts = S.UPDRAFTS.map(u => {
    const h = u.y1 - u.y0;
    const mat = new THREE.MeshBasicMaterial({ map: streak.clone(), color: 0xd8f4ff, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
    mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping; mat.map.repeat.set(3, h / 10); mat.map.needsUpdate = true;
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(u.r, u.r * 0.85, h, 24, 1, true), mat);
    tube.position.set(u.x, u.y0 + h / 2, u.z);
    tube.userData.noOutline = true; tube.renderOrder = 4;
    sc.add(tube);
    const inner = tube.clone(); inner.material = mat.clone(); inner.material.map = mat.map.clone(); inner.material.map.needsUpdate = true;
    inner.scale.set(0.6, 1, 0.6); sc.add(inner);
    // anneau de base qui souffle
    const ring = new THREE.Mesh(new THREE.TorusGeometry(u.r * 0.9, 0.12, 6, 28), new THREE.MeshBasicMaterial({ color: 0xbaf0ff, transparent: true, opacity: 0.6 }));
    ring.rotation.x = Math.PI / 2; ring.position.set(u.x, u.y0 + 0.3, u.z); ring.userData.noOutline = true;
    sc.add(ring);
    return { def: u, tube, inner, ring };
  });

  // --- Pont des Copains : dalles et planches ---------------------------------------
  const plateTex = [pawTexture(false), pawTexture(true)];
  const plates = S.PLATES.map(p => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.5, 0.3, 24), M.mat(0x8a7a6a, { roughness: 0.9 }));
    base.position.y = 0.1; g.add(base);
    const topMat = new THREE.MeshStandardMaterial({ map: plateTex[0], roughness: 0.6, emissive: 0xffc030, emissiveIntensity: 0 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.18, 24), [M.mat(0x6a5a4a), topMat, M.mat(0x6a5a4a)]);
    top.position.y = 0.32; g.add(top);
    const glow = new THREE.Mesh(new THREE.RingGeometry(1.2, 1.9, 32), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0, depthWrite: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; glow.userData.noOutline = true; g.add(glow);
    g.position.set(p.x, p.y - 0.05, p.z);
    sc.add(g);
    return { def: p, g, top, topMat, glow };
  });
  const B = S.BRIDGE, PLANKS = 18;
  const plankMat = M.mat(0xc08a52, { roughness: 0.85 });
  const ropeMat = M.mat(0xe8d8b0, { roughness: 0.9 });
  const planks = [];
  for (let i = 0; i < PLANKS; i++) {
    const len = (B.z0 - B.z1) / PLANKS;
    const m = new THREE.Mesh(new THREE.BoxGeometry(B.w, 0.22, len * 0.9), plankMat);
    m.position.set(B.x + (i % 2 ? 0.06 : -0.06), B.top - 0.11, B.z0 - len * (i + 0.5));
    m.castShadow = true; m.receiveShadow = true;
    sc.add(m); planks.push(m);
  }
  for (const z of [B.z0 + 0.3, B.z1 - 0.3]) for (const sx of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 1.6, 8), plankMat);
    post.position.set(B.x + sx * (B.w / 2 + 0.2), B.top + 0.6, z); sc.add(post);
  }
  const ropes = [-1, 1].map(sx => {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1, 6), ropeMat);
    m.rotation.x = Math.PI / 2; sc.add(m);
    return { m, sx };
  });

  // --- drapeaux ---------------------------------------------------------------------
  const flagTex = flagTexture();
  // (mâts et pommeaux de tous les drapeaux : un seul objet, moins de travail pour le téléphone)
  const poleParts = [];
  const clothMat = new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8 });
  const flags = S.CHECKPOINTS.map((c) => {
    const g = new THREE.Group();
    const fx = c.x + (c.fx === undefined ? 2.3 : c.fx), fz = c.z + (c.fz || 0);
    const fy = S.heightAt(fx, fz) > c.y - 1 ? S.heightAt(fx, fz) : c.y;
    poleParts.push({ geo: paint(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), 0xf0e6d0), x: fx, y: fy + 1.8, z: fz });
    poleParts.push({ geo: paint(new THREE.SphereGeometry(0.16, 10, 6), 0xffd23a), x: fx, y: fy + 3.65, z: fz });
    const clothGeo = new THREE.PlaneGeometry(1.4, 0.75, 10, 4); clothGeo.translate(0.72, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, clothMat.clone());
    cloth.position.y = 1.0; g.add(cloth);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; halo.userData.noOutline = true; halo.visible = false; g.add(halo);
    g.position.set(fx, fy, fz);
    sc.add(g);
    return { def: c, g, cloth, halo, base: clothGeo.attributes.position.array.slice(), raise: sky().flags.includes(c.id) ? 1 : 0, raisedAt: -9 };
  });
  { const pm = new THREE.Mesh(M.mergeGeos(poleParts), std({ metalness: 0.4, roughness: 0.35 })); pm.castShadow = !lite; sc.add(pm); }

  // --- décor : moulin, ballons, tour de cristal, arche d'arrivée ---------------------
  const MI = S.MILL;
  const mill = new THREE.Group();
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(MI.r * 0.75, MI.r, MI.h, 10), M.mat(0xf4e8d4, { roughness: 0.85 }));
  tower.position.y = MI.h / 2; tower.castShadow = true; mill.add(tower);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(MI.r * 1.05, 2.2, 10), M.mat(0xd8503a, { roughness: 0.7 }));
  roof.position.y = MI.h + 1.1; roof.castShadow = true; mill.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.4, 0.1), M.mat(0x7a4a2a));
  door.position.set(0, 0.7, -MI.r * 0.98); mill.add(door);
  const blades = new THREE.Group();
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.2, 0.06), M.mat(0xfff6ea, { roughness: 0.8 }));
    b.position.y = 2.2; const arm = new THREE.Group(); arm.add(b); arm.rotation.z = k * Math.PI / 2; blades.add(arm);
  }
  blades.position.set(0, MI.h - 0.6, -MI.r * 0.95);
  mill.add(blades);
  mill.position.set(MI.x, MI.y, MI.z); mill.rotation.y = 0.5;
  sc.add(mill);

  const balloonCols = [0xff5a6a, 0xffc83a, 0x5ac8ff, 0x8ae05a, 0xc88aff, 0xff8ad8];
  const balloons = [];
  const BI = S.ISLANDS.find(q => q.id === 'balloon');
  for (let k = 0; k < 6; k++) {
    const a = k * 1.05 + 0.4, d = BI.r * 0.82;
    const x = BI.x + Math.cos(a) * d, z = BI.z + Math.sin(a) * d, y = S.heightAt(x, z);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), M.mat(balloonCols[k], { roughness: 0.25, metalness: 0.05 }));
    b.scale.set(1, 1.18, 1); b.castShadow = true;
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 3, 4), ropeMat);
    sc.add(b, string);
    balloons.push({ b, string, x, y, z, ph: k * 1.7 });
  }

  const T = S.TOWER;
  // la Tour du Vent : un grand cristal taillé (facettes), des éclats autour du pied, un plateau d'or au sommet
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x9ad8ff, roughness: 0.12, metalness: 0.15, emissive: 0x2a5ac0, emissiveIntensity: 0.55, flatShading: true });
  const towerGeo = new THREE.CylinderGeometry(T.r * 0.9, T.r, T.top - 19, 6, 6);
  { const tp = towerGeo.attributes.position; for (let i = 0; i < tp.count; i++) { const y = tp.getY(i), k = 1 + Math.sin(y * 1.7 + Math.atan2(tp.getZ(i), tp.getX(i)) * 3) * 0.04; tp.setX(i, tp.getX(i) * k); tp.setZ(i, tp.getZ(i) * k); } towerGeo.computeVertexNormals(); }
  const crystal = new THREE.Mesh(towerGeo, crystalMat);
  crystal.position.set(T.x, 19 + (T.top - 19) / 2, T.z); crystal.castShadow = true;
  sc.add(crystal);
  const shards = [];
  for (let k = 0; k < 7; k++) {
    const a = k * 0.9 + 0.3, h = 2 + (k % 3) * 1.2, g = new THREE.OctahedronGeometry(0.45, 0);
    g.scale(1, h / 0.9, 1); g.rotateZ((k % 2 ? 1 : -1) * 0.3); g.rotateY(a);
    shards.push({ geo: g, x: T.x + Math.cos(a) * (T.r + 0.5), y: 19.3 + h * 0.35, z: T.z + Math.sin(a) * (T.r + 0.5) });
  }
  const shardMesh = new THREE.Mesh(M.mergeGeos(shards), crystalMat); shardMesh.castShadow = true; sc.add(shardMesh);
  const crystalBase = new THREE.Mesh(padGeometry(T.r * 1.6, 333), rockMat);
  crystalBase.position.set(T.x, 19.3, T.z); sc.add(crystalBase);
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(T.r * 1.08, T.r * 0.92, 0.45, 6), M.mat(0xffd23a, { metalness: 0.7, roughness: 0.3, emissive: 0x7a4a00, emissiveIntensity: 0.35 }));
  cap.position.set(T.x, T.top - 0.22, T.z); cap.castShadow = true; sc.add(cap);

  const GI = S.ISLANDS.find(q => q.id === 'goal');
  const arch = new THREE.Group();
  const goldMat = M.mat(0xffd23a, { metalness: 0.75, roughness: 0.25, emissive: 0x7a4a00, emissiveIntensity: 0.35 });
  for (const sx of [-1, 1]) { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, 5, 12), goldMat); col.position.set(sx * 3.2, 2.5, 0); col.castShadow = true; arch.add(col); }
  const top = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.32, 10, 40, Math.PI), goldMat);
  top.position.y = 5; arch.add(top);
  arch.position.set(GI.x, GI.top + 0.3, GI.z + 6.5);
  sc.add(arch);
  // (le module des données survit d'une partie à l'autre : on repart d'un état propre)
  for (const c of S.crumbles) c.col.off = false;

  // --- mer de nuages : un tapis de nuages moelleux, éclairé par le soleil, qui dérive
  // lentement ; par quelques trouées on aperçoit la mer, tout en bas ---------------------------
  const cloudFloorMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uFog: { value: sc.fog.color }, uNear: { value: 90 }, uFar: { value: 520 }, uSun: { value: new THREE.Vector3(...S.SKY.sunDir).normalize() },
      uTint: { value: new THREE.Color(S.SKY.horizon) } },
    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `uniform float uTime, uNear, uFar; uniform vec3 uFog, uSun, uTint; varying vec3 vW;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      float fbm(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * n(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }
      void main(){
        vec2 p = vW.xz * 0.018 + vec2(uTime * 0.006, uTime * 0.002);
        float d = fbm(p);
        // relief : le côté tourné vers le soleil est plus clair
        float dl = fbm(p + uSun.xz * 0.06);
        float lit = clamp(0.62 + (d - dl) * 3.2, 0.35, 1.0);
        float cover = smoothstep(0.30, 0.52, d);
        vec3 shade = mix(vec3(0.62, 0.66, 0.82), vec3(1.0, 0.985, 0.975), lit);
        shade = mix(shade, shade * uTint, 0.22);
        vec3 sea = vec3(0.10, 0.36, 0.62) * (0.8 + 0.2 * n(vW.xz * 0.2 + uTime * 0.3));
        vec3 col = mix(sea, shade, cover);
        float f = smoothstep(uNear, uFar, length(cameraPosition.xz - vW.xz));
        gl_FragColor = vec4(mix(col, uFog, f), 1.0);
      }`,
  });
  const cloudFloor = new THREE.Mesh(new THREE.PlaneGeometry(1600, 1600, 1, 1), cloudFloorMat);
  cloudFloor.rotation.x = -Math.PI / 2; cloudFloor.position.y = -12; cloudFloor.userData.noOutline = true;
  sc.add(cloudFloor);
  const seaMat = cloudFloorMat;      // (animé plus bas, comme l'ancienne mer)
  // quelques gros nuages en volume qui dépassent du tapis
  const cloudSea = [];
  {
    const r = rng(77), mat = std({ roughness: 1, emissive: 0xffffff, emissiveIntensity: 0.18 });
    const N = lite ? 10 : 22;
    for (let i = 0; i < N; i++) {
      const x = (r() - 0.5) * 340, z = 140 - r() * 340;
      if (S.ISLANDS.some(I => Math.hypot(x - I.x, z - I.z) < I.r + 20)) continue;       // pas sous le parcours (on les verrait de près)
      const m = new THREE.Mesh(cloudGeometry(6 + r() * 8, 900 + i), mat);
      m.scale.set(1, 0.8 + r() * 0.5, 1);
      m.position.set(x, -11 + r() * 3, z); m.userData = { x, y: m.position.y, z, ph: r() * 6, sp: 0.3 + r() * 0.6, noOutline: true };
      sc.add(m); cloudSea.push(m);
    }
  }
  // îlots lointains (décor)
  const farIsles = [];
  {
    const r = rng(99);
    // loin du parcours (on ne doit pas pouvoir les prendre pour un chemin)
    const clear = (x, z, rad) => !S.ISLANDS.some(I => Math.hypot(x - I.x, z - I.z) < I.r + rad + 30) && !S.RIBBONS.some(R => R.pts.some(p => Math.hypot(x - p.x, z - p.z) < rad + 22));
    for (let i = 0, tries = 0; i < 9 && tries < 300; tries++) {
      const side = i % 2 ? 1 : -1, x = side * (45 + r() * 110), z = 130 - r() * 320, rad = 3 + r() * 5, y = 6 + r() * 30;
      if (!clear(x, z, rad)) continue;
      i++;
      const I = { x: 0, z: 0, r: rad, top: 0 };
      const g = islandMeshes(I, 500 + i, true);
      const grp = new THREE.Group();
      grp.add(new THREE.Mesh(g.under, rockMat), new THREE.Mesh(g.top, grassMat));
      const tr = new THREE.Mesh(new THREE.IcosahedronGeometry(rad * 0.35, 1), M.mat(0x6ac850, { roughness: 0.9 }));
      tr.position.set(rad * 0.2, rad * 0.4, 0); grp.add(tr);
      grp.position.set(x, y, z); grp.userData.y0 = y; grp.userData.ph = r() * 6;
      sc.add(grp); farIsles.push(grp);
    }
  }
  // oiseaux qui tournent au loin
  const birds = [];
  {
    const wing = new THREE.BufferGeometry();
    wing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.9, 0.25, -0.2, -0.2, 0, 0.15, 0, 0, 0, 0.9, 0.25, -0.2, 0.2, 0, 0.15], 3));
    wing.computeVertexNormals();
    const bm = new THREE.MeshBasicMaterial({ color: 0x4a5a7a, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(wing, bm); b.userData = { R: 30 + i * 9, y: 26 + i * 3, w: 0.12 + i * 0.015, a: i * 1.3, cz: 20 - i * 25, noOutline: true }; sc.add(b); birds.push(b); }
  }

  // =================================================================================
  // L'Île du Carillon et ses branches : tourniquet, grande roue, rafales, cloches,
  // chemins d'arc-en-ciel, canons, Nimbus et ses plumes
  // =================================================================================
  const woodMat = M.mat(0xb8804a, { roughness: 0.8 });
  const near = (x, z, R) => { const c = game.camera ? game.camera.position : null; return !c || Math.hypot(c.x - x, c.z - z) < R; };

  // --- le Tourniquet --------------------------------------------------------------
  const TS = S.TURNSTILE;
  const turn = new THREE.Group();
  {
    const plankG = paint(new THREE.BoxGeometry(TS.hl * 2, 0.42, TS.hw * 2, 12, 1, 1), (c, x, y) => {
      c.set(0xc89058);
      if (Math.floor((x + TS.hl) / 0.9) % 2) c.multiplyScalar(0.88);
      if (Math.abs(x) > TS.hl - 0.6) c.set(x < 0 ? 0xff7aa8 : 0x6ab8ff);        // bouts colorés
      if (y < 0) c.multiplyScalar(0.7);
    });
    const parts = [{ geo: plankG, y: -0.21 }];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push({ geo: paint(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 6), 0xb8804a), x: sx * (TS.hl - 0.3), y: 0.35, z: sz * (TS.hw - 0.12) });
    const plank = new THREE.Mesh(M.mergeGeos(parts), std({ roughness: 0.8 }));
    plank.castShadow = !lite; plank.receiveShadow = true;
    turn.add(plank);
  }
  turn.position.set(TS.x, TS.top, TS.z);
  sc.add(turn); moving.push(turn);
  const pivot = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.5, 0.45, 24), goldMat);
  pivot.position.set(TS.x, TS.top - 0.17, TS.z); pivot.castShadow = !lite; sc.add(pivot);
  const pivotRock = new THREE.Mesh(padGeometry(1.3, 444), rockMat);
  pivotRock.position.set(TS.x, TS.top - 0.4, TS.z); sc.add(pivotRock);

  // --- la Grande Roue des Nuages --------------------------------------------------
  const WH = S.WHEEL;
  const wheel = new THREE.Group();
  {
    const rimMat = M.mat(0xff9ac8, { roughness: 0.5, emissive: 0x7a2a50, emissiveIntensity: 0.2 });
    const parts = [];
    for (const x of [-2.1, 2.1]) {
      const rim = new THREE.TorusGeometry(WH.R, 0.14, 6, lite ? 40 : 64); rim.rotateY(Math.PI / 2);
      parts.push({ geo: rim, x });
      for (let k = 0; k < 8; k++) {
        const sp = new THREE.CylinderGeometry(0.07, 0.07, WH.R, 5); sp.translate(0, WH.R / 2, 0);
        parts.push({ geo: sp, x, rx: k * Math.PI / 4 });
      }
    }
    const wm = new THREE.Mesh(M.mergeGeos(parts), rimMat);
    wm.castShadow = !lite; wheel.add(wm);
    // petites lumières sur la jante
    const bulbs = [];
    for (let k = 0; k < 16; k++) for (const x of [-2.1, 2.1]) bulbs.push({ geo: new THREE.SphereGeometry(0.13, 6, 4), x, y: Math.sin(k / 16 * Math.PI * 2) * WH.R, z: Math.cos(k / 16 * Math.PI * 2) * WH.R });
    const bm = new THREE.Mesh(M.mergeGeos(bulbs), new THREE.MeshBasicMaterial({ color: 0xfff0a0 }));
    bm.userData.noOutline = true; wheel.add(bm);
  }
  wheel.position.set(WH.cx, WH.cy, WH.cz);
  sc.add(wheel); moving.push(wheel);
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, S.HUB_DRUM.w, 20), goldMat);
  drum.rotation.z = Math.PI / 2; drum.position.set(WH.cx, WH.cy, WH.cz); drum.castShadow = !lite; sc.add(drum);
  // les pieds de la roue, posés sur deux rochers flottants
  {
    const legs = [-1, 1].map(sx => ({ geo: new THREE.CylinderGeometry(0.22, 0.3, 9, 8), x: WH.cx + sx * 3.1, y: WH.cy - 4.3, z: WH.cz, rz: sx * 0.12 }));
    sc.add(new THREE.Mesh(M.mergeGeos(legs), M.mat(0x9ad8ff, { roughness: 0.3, emissive: 0x2a5ac0, emissiveIntensity: 0.3 })));
    const feet = [-1, 1].map(sx => ({ geo: padGeometry(1.4, 450 + sx), x: WH.cx + sx * 3.6, y: WH.cy - 8.6, z: WH.cz }));
    sc.add(new THREE.Mesh(M.mergeGeos(feet), rockMat));
  }

  // --- le Col des Rafales : rochers-abris, haie, manches à air, traînées de vent ----
  {
    const rocks = S.SHELTERS.map((s, i) => { const g = new THREE.DodecahedronGeometry(s.r * 1.15, 0); g.rotateY(i * 1.3); g.rotateX(0.3); return { geo: paint(g, (c, x, y, z) => { c.set(ROCK_BANDS[(i + Math.floor((y + 1) * 1.5)) % 4]); c.multiplyScalar(0.9 + hash3(x * 3, y * 3, z * 3) * 0.2); }), x: s.x, y: s.base + s.h * 0.45, z: s.z, sx: 1, sy: s.h / (s.r * 2) * 1.1 }; });
    const rm = new THREE.Mesh(mergeRaw(rocks.map(q => { const g = q.geo.index ? q.geo.toNonIndexed() : q.geo; g.scale(1, q.sy, 1); g.translate(q.x, q.y, q.z); g.computeVertexNormals(); return g; })), islandRock); rm.castShadow = !lite; rm.receiveShadow = true; sc.add(rm);
    const hedge = S.HEDGE.map((h, i) => ({ geo: paint(new THREE.IcosahedronGeometry(0.85, 1), (c) => c.set(i % 2 ? 0x5aa83e : 0x4a9832)), x: h.x, y: h.y + 0.55, z: h.z, sy: 1.0 }));
    const hm = new THREE.Mesh(M.mergeGeos(hedge), std({ roughness: 0.95 })); hm.castShadow = true; sc.add(hm);
  }
  const SOCK_AT = [[23.6, -106.2], [33.3, -97.4], [68.6, -104.3]];
  const sockTex = canvasTex(64, 16, (x) => { for (let i = 0; i < 5; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#ff4a3a'; x.fillRect(i * 13, 0, 13, 16); } });
  const socks = S.GUSTS.map((g, i) => {
    const [x, z] = SOCK_AT[i];
    const grp = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 6), M.mat(0xe8e0d0, { metalness: 0.4, roughness: 0.4 }));
    pole.position.y = 1.6; grp.add(pole);
    const sockG = new THREE.CylinderGeometry(0.32, 0.16, 1.6, 12, 1, true); sockG.rotateX(Math.PI / 2); sockG.translate(0, 0, 0.8);
    const sock = new THREE.Mesh(sockG, new THREE.MeshStandardMaterial({ map: sockTex, side: THREE.DoubleSide, roughness: 0.8 }));
    sock.position.y = 3.05; grp.add(sock);
    grp.position.set(x, S.heightAt(x, z), z);
    sc.add(grp);
    return { g, grp, sock };
  });
  const streakMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: true });
  const streaks = S.GUSTS.map((g, i) => {
    const n = lite ? 12 : 26, r = rng(300 + i);
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.05, 0.05, 2.6), streakMat(), n);
    mesh.userData.noOutline = true; mesh.frustumCulled = false; mesh.visible = false;
    const seeds = [];
    for (let k = 0; k < n; k++) seeds.push({ x: g.x0 + r() * (g.x1 - g.x0), y: g.y0 + 2 + r() * 6, f: r(), sp: 0.8 + r() * 0.5 });
    sc.add(mesh);
    return { g, mesh, seeds };
  });
  const dummy = new THREE.Object3D();

  // --- les cloches -------------------------------------------------------------------
  const bellProfile = [[0, 0], [0.62, 0], [0.66, 0.12], [0.55, 0.35], [0.42, 0.85], [0.36, 1.05], [0.22, 1.18], [0, 1.2]].map(([x, y]) => new THREE.Vector2(x, y));
  const bells = S.BELLS.map((b) => {
    const grp = new THREE.Group();
    const roofG = new THREE.ConeGeometry(2.1, 0.9, 4); roofG.rotateY(Math.PI / 4); roofG.scale(1, 1, 0.55);
    const frame = new THREE.Mesh(M.mergeGeos([
      ...[-1, 1].map(sx => ({ geo: paint(new THREE.CylinderGeometry(0.12, 0.16, 3.4, 8), 0xb8804a), x: sx * 1.35, y: 1.7 })),
      { geo: paint(new THREE.BoxGeometry(3.1, 0.22, 0.26), 0xa8703a), y: 3.35 },
      { geo: paint(roofG, b.color), y: 3.9 },
    ]), std({ roughness: 0.65 }));
    frame.castShadow = !lite; grp.add(frame);
    const swing = new THREE.Group(); swing.position.y = 3.25; grp.add(swing);
    const mat = new THREE.MeshStandardMaterial({ color: b.color, metalness: 0.65, roughness: 0.28, emissive: b.color, emissiveIntensity: 0.05 });
    const body = new THREE.Mesh(M.mergeGeos([{ geo: new THREE.LatheGeometry(bellProfile, 20), y: -1.3 }, { geo: new THREE.SphereGeometry(0.15, 10, 8), y: -1.32 }]), mat);
    body.castShadow = !lite; swing.add(body);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: b.color, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(4, 4, 1); glow.position.y = 2.6; glow.userData.noOutline = true; grp.add(glow);
    const halo = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.6, 32), new THREE.MeshBasicMaterial({ color: b.color, transparent: true, opacity: 0.5, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; halo.userData.noOutline = true; grp.add(halo);
    grp.position.set(b.x, b.y, b.z);
    grp.rotation.y = Math.atan2(S.isle('hub').x - b.x, S.isle('hub').z - b.z) + Math.PI / 2;
    sc.add(grp);
    return { def: b, grp, swing, mat, glow, halo };
  });
  // la porte du pont arc-en-ciel, au nord du Carillon : une boule par cloche
  const HUB = S.isle('hub');
  const gate = new THREE.Group();
  const orbs = [];
  {
    const stoneG = M.mergeGeos([...[-1, 1].map(sx => ({ geo: new THREE.CylinderGeometry(0.4, 0.5, 4.6, 10), x: sx * 2.8, y: 2.3 })), { geo: new THREE.TorusGeometry(2.8, 0.3, 8, 36, Math.PI), y: 4.6 }]);
    const stone = new THREE.Mesh(stoneG, M.mat(0xf4ecdc, { roughness: 0.7 })); stone.castShadow = !lite; gate.add(stone);
    S.BELLS.forEach((b, i) => {
      const a = Math.PI * (0.25 + i * 0.25);
      const o = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), new THREE.MeshStandardMaterial({ color: 0x8a8a9a, roughness: 0.3, emissive: b.color, emissiveIntensity: 0 }));
      o.position.set(Math.cos(a) * 2.8, 4.6 + Math.sin(a) * 2.8 + 0.3, 0); gate.add(o);
      orbs.push(o);
    });
  }
  gate.position.set(HUB.x, S.heightAt(HUB.x, -111.2), -111.2);
  sc.add(gate);

  // --- les chemins d'arc-en-ciel -------------------------------------------------------
  const RAINBOW_COLS = [0xff5a5a, 0xffa040, 0xffe050, 0x6ad86a, 0x5aa8ff, 0xb07aff].map(c => new THREE.Color(c));
  const ribbonMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, emissive: 0xffffff, emissiveIntensity: 0.22, transparent: true, opacity: 0.93, side: THREE.DoubleSide });
  const ribbons = S.RIBBONS.map(R => {
    const pos = [], col = [], P = R.pts, B = RAINBOW_COLS.length, W2 = R.w / 2;
    const side = (i) => { const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)]; const dx = b.x - a.x, dz = b.z - a.z, l = Math.hypot(dx, dz) || 1; return [-dz / l, dx / l]; };
    for (let i = 0; i + 1 < P.length; i++) {
      const p = P[i], q = P[i + 1], sp = side(i), sq = side(i + 1);
      for (let j = 0; j < B; j++) {
        const o0 = -W2 + (j / B) * R.w, o1 = -W2 + ((j + 1) / B) * R.w, c = RAINBOW_COLS[j];
        const v = [[p.x + sp[0] * o0, p.y + 0.02, p.z + sp[1] * o0], [p.x + sp[0] * o1, p.y + 0.02, p.z + sp[1] * o1], [q.x + sq[0] * o1, q.y + 0.02, q.z + sq[1] * o1], [q.x + sq[0] * o0, q.y + 0.02, q.z + sq[1] * o0]];
        for (const k of [0, 2, 1, 0, 3, 2]) { pos.push(...v[k]); col.push(c.r, c.g, c.b); }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, ribbonMat);
    mesh.userData.noOutline = true; mesh.receiveShadow = true; mesh.visible = false;
    sc.add(mesh);
    return { def: R, mesh, total: pos.length / 3 };
  });
  const ribbonOf = (id) => ribbons.find(r => r.def.id === id);
  const ribbonOn = (id) => (id === 'pont' ? sky().bells.length >= S.BELLS.length : sky().bells.includes(id));
  function syncRibbons(instant) {
    for (const R of S.RIBBONS) {
      const on = ribbonOn(R.id);
      for (const c of R.cols) c.off = !on;
      if (instant) st.rib[R.id] = on ? 1 : 0;
    }
  }

  // --- les canons à nuages --------------------------------------------------------------
  const targetTex = canvasTex(128, 128, (x) => { for (let i = 0; i < 4; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#e8483a'; x.beginPath(); x.arc(64, 64, 62 - i * 15, 0, 7); x.fill(); } });
  const cannons = S.CANNONS.map((c) => {
    const dx = c.to.x - c.x, dz = c.to.z - c.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l;
    const grp = new THREE.Group();
    const barrel = new THREE.Group();
    const tube = new THREE.Mesh(M.mergeGeos([
      { geo: paint(new THREE.CylinderGeometry(0.62, 0.82, 3.0, 20), 0x5a6a8a), z: 0.6, rx: Math.PI / 2 },
      { geo: paint(new THREE.TorusGeometry(0.66, 0.12, 8, 24), 0xffd23a), z: 2.1 },
      ...[0, 1, 2].map(k => ({ geo: paint(new THREE.TorusGeometry(0.7 + k * 0.05, 0.06, 6, 24), [0xff7ab0, 0xffe050, 0x6ab8ff][k]), z: -0.4 + k * 0.6 })),
    ]), std({ metalness: 0.55, roughness: 0.35 }));
    tube.castShadow = !lite; barrel.add(tube);
    barrel.rotation.x = -0.65; barrel.position.y = 1.3;
    grp.add(barrel);
    grp.add(new THREE.Mesh(M.mergeGeos([-1, 1].map(sx => ({ geo: new THREE.CylinderGeometry(0.75, 0.75, 0.22, 16), x: sx * 0.95, y: 0.75, z: -0.2, rz: Math.PI / 2 }))), woodMat));
    grp.position.set(c.x - ux * 2.4, S.heightAt(c.x - ux * 2.4, c.z - uz * 2.4), c.z - uz * 2.4);
    grp.rotation.y = Math.atan2(ux, uz);
    sc.add(grp);
    const ring = new THREE.Mesh(new THREE.CircleGeometry(c.r, 32), new THREE.MeshBasicMaterial({ map: targetTex, transparent: true, opacity: 0.9, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(c.x, c.y + 0.06, c.z); ring.userData.noOutline = true;
    sc.add(ring);
    return { def: c, grp, barrel, ring, ux, uz, fireT: -9 };
  });

  // --- Nimbus, le carlin aviateur ---------------------------------------------------------
  const NB = S.NIMBUS;
  const nimbus = M.buildPug({ fur: 0xe0c49a, mask: 0x3a2a22, belly: 0xf6e6cc, collar: 0x3a7ad8, scale: 1.55 });
  {
    const u = nimbus.userData, head = u.mhead;
    if (head) {
      // casque de cuir et lunettes d'aviateur
      const capG = new THREE.SphereGeometry(0.31, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
      const cap = new THREE.Mesh(capG, M.mat(0x8a5a32, { roughness: 0.7 })); cap.position.y = 0.04; cap.rotation.x = -0.25; head.add(cap);
      for (const sx of [-1, 1]) {
        const lens = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.025, 6, 16), M.mat(0xc8a040, { metalness: 0.7, roughness: 0.3 }));
        lens.position.set(sx * 0.1, 0.22, 0.2); lens.rotation.x = -0.6; head.add(lens);
        const glass = new THREE.Mesh(new THREE.CircleGeometry(0.06, 12), new THREE.MeshStandardMaterial({ color: 0x9ad8ff, roughness: 0.1, metalness: 0.3, transparent: true, opacity: 0.8 }));
        glass.position.set(sx * 0.1, 0.22, 0.205); glass.rotation.x = -0.6; head.add(glass);
      }
    }
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.06, 8, 20), M.mat(0xe8483a, { roughness: 0.9 }));
    scarf.rotation.x = Math.PI / 2 - 0.5; scarf.position.set(0, 0.64, 0.2);
    const scarfTail = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.42), M.mat(0xe8483a, { roughness: 0.9 }));
    scarfTail.position.set(0.12, 0.66, -0.05); scarfTail.rotation.y = 0.4;
    const body = u.matcha && u.matcha.children[0];
    if (body) { body.add(scarf); body.add(scarfTail); u.scarfTail = scarfTail; }
  }
  nimbus.position.set(NB.x, NB.y, NB.z);
  nimbus.rotation.y = Math.atan2(0 - NB.x, -88 - NB.z);
  sc.add(nimbus); chars.push(nimbus);
  const nimbusMark = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(64, 64, (x) => { x.fillStyle = '#ffd23a'; x.strokeStyle = '#6a3a00'; x.lineWidth = 6; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.strokeText('!', 32, 34); x.fillText('!', 32, 34); }), transparent: true, depthWrite: false }));
  nimbusMark.scale.set(0.9, 0.9, 1); nimbusMark.userData.noOutline = true; sc.add(nimbusMark);

  // --- les plumes arc-en-ciel ---------------------------------------------------------------
  const featherGeo = (() => {
    const s = new THREE.Shape();
    s.moveTo(0, -0.55); s.quadraticCurveTo(0.26, -0.2, 0.17, 0.25); s.quadraticCurveTo(0.08, 0.5, 0, 0.6); s.quadraticCurveTo(-0.12, 0.35, -0.16, 0.05); s.quadraticCurveTo(-0.18, -0.3, 0, -0.55);
    const g = new THREE.ShapeGeometry(s, 8);
    return paint(g, (c, x, y) => c.setHSL(clamp((y + 0.55) / 1.15, 0, 1) * 0.8, 0.85, 0.62));
  })();
  const featherMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.3 });
  const feathers = S.FEATHERS.map((f) => {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(featherGeo, featherMat); m.scale.setScalar(1.3); grp.add(m);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0xffffff, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }));
    glow.scale.set(2.2, 2.2, 1); glow.userData.noOutline = true; grp.add(glow);
    grp.position.set(f.x, f.y, f.z);
    grp.visible = !sky().feathers.includes(f.id);
    sc.add(grp);
    return { def: f, grp, m };
  });

  // =================================================================================
  // La vie des îles : ballons à éclater, papillons géants, petits oiseaux,
  // habitants (et leurs petits défis)
  // =================================================================================
  const aud = () => (game.sfx && game.sfx.ok ? game.sfx : null);
  const life = (() => {
    const L = { popped: new Map(), defi: null, bounces: 0, ride: 0, rideOf: null };
    const dm = new THREE.Object3D(), col = new THREE.Color();
    const meNear = (x, z, R) => near(x, z, R);
    // --- ballons ---------------------------------------------------------------------
    const BL = S.BALLOONS;
    const bGeo = new THREE.SphereGeometry(0.55, lite ? 10 : 14, lite ? 8 : 10); bGeo.scale(1, 1.18, 1);
    const bMesh = new THREE.InstancedMesh(bGeo, new THREE.MeshStandardMaterial({ roughness: 0.25, metalness: 0.05 }), BL.length);
    const sMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.012, 1.4, 3).translate(0, -0.7, 0), ropeMat, BL.length);
    BL.forEach((b, i) => bMesh.setColorAt(i, col.setHex(b.color)));
    bMesh.instanceColor.needsUpdate = true;
    bMesh.frustumCulled = false; sMesh.frustumCulled = false; sMesh.userData.noOutline = true;
    bMesh.castShadow = !lite;
    sc.add(bMesh, sMesh);
    function pop(i, P) {
      const b = BL[i];
      L.popped.set(i, game.t);
      game.burst(b.x, b.y, b.z, 16, b.color, 4, 0.5);
      game.burst(b.x, b.y, b.z, 6, 0xffffff, 3, 0.35);
      const a = aud(); if (a) { a.noise(0.12, { freq: 2600, freqTo: 700, vol: 0.28 }); a.tone(880, 0.09, { type: 'triangle', to: 1500, vol: 0.08 }); }
      if (P) {
        // boing ! on rebondit sur le ballon (et le double saut revient)
        if (P.vel.y < S.POP_BOUNCE) P.vel.y = S.POP_BOUNCE;
        P.grounded = false; P.jumps = 1; P.coyote = 0; P.cheerT = 0.3;
        if (P === game.me && !st.popTold) { st.popTold = true; game.banner('Pop !', 'Sauter sur un ballon fait rebondir très haut', 2000); }
      }
      if (L.defi && L.defi.id === 'ballons' && b.group === 'z' && !L.defi.got.has(i)) {
        L.defi.got.add(i);
        const n = L.defi.got.size, tot = BL.filter(q => q.group === 'z').length;
        if (n >= tot) winDefi('ballons'); else game.banner(`Ballons de Zéphyr : ${n}/${tot}`, `Encore ${Math.ceil(L.defi.end - game.t)} s`, 1100);
      }
    }
    // --- papillons géants ------------------------------------------------------------
    const BF = [];
    S.BUTTERFLIES.forEach((h, i) => { for (let k = 0; k < 2; k++) BF.push({ h, ph: i * 1.7 + k * 3.1, r: 1.2 + k * 0.9, sp: 0.5 + ((i * 7 + k * 3) % 5) * 0.08, flee: 0, hue: ((i * 0.13 + k * 0.37) % 1) }); });
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, 0); wingShape.bezierCurveTo(0.25, 0.55, 0.75, 0.6, 0.62, 0.12); wingShape.bezierCurveTo(0.72, -0.25, 0.35, -0.5, 0, 0);
    const wingGeo = new THREE.ShapeGeometry(wingShape, 6); wingGeo.rotateX(-Math.PI / 2);
    const wMesh = new THREE.InstancedMesh(wingGeo, new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.5, emissive: 0xffffff, emissiveIntensity: 0.18 }), BF.length * 2);
    BF.forEach((b, i) => { col.setHSL(b.hue, 0.8, 0.6); wMesh.setColorAt(i * 2, col); wMesh.setColorAt(i * 2 + 1, col); });
    wMesh.instanceColor.needsUpdate = true; wMesh.frustumCulled = false; wMesh.userData.noOutline = true;
    sc.add(wMesh);
    // --- petits oiseaux posés --------------------------------------------------------
    const BD = [];
    S.BIRDS.forEach((f, i) => { for (let k = 0; k < 5; k++) { const a = k * 1.26 + i, d = 0.8 + (k % 3) * 0.7; BD.push({ f, x: f.x + Math.cos(a) * d, z: f.z + Math.sin(a) * d, a, fly: 0, ph: i + k * 0.7, peck: 0 }); } });
    const birdBody = paint(new THREE.SphereGeometry(0.16, 8, 6).scale(0.8, 0.8, 1.3), 0xffffff);
    const birdWing = new THREE.BufferGeometry();
    birdWing.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.1, -0.42, 0.05, -0.05, 0, 0, -0.12, 0, 0, 0.1, 0.42, 0.05, -0.05, 0, 0, -0.12], 3));
    birdWing.computeVertexNormals();
    const bdMat = new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide });
    const bbMesh = new THREE.InstancedMesh(birdBody, bdMat, BD.length), bwMesh = new THREE.InstancedMesh(birdWing, bdMat, BD.length);
    BD.forEach((b, i) => { col.setHex([0x5a8ae0, 0xe8604a, 0xf0c040, 0x6ac0a0, 0xa070d0][i % 5]); bbMesh.setColorAt(i, col); bwMesh.setColorAt(i, col.multiplyScalar(0.8)); });
    for (const m of [bbMesh, bwMesh]) { m.instanceColor.needsUpdate = true; m.frustumCulled = false; m.userData.noOutline = true; sc.add(m); }
    // --- habitants -------------------------------------------------------------------
    const res = S.RESIDENTS.map((r, i) => {
      let m;
      if (r.model === 'sheep') { m = sheepModel(1.1, 990 + i, true); m.position.y = 1.15; const g = new THREE.Group(); g.add(m); m = g; }
      else if (r.model === 'pug') m = M.buildPug({ fur: r.fur, collar: r.collar, scale: 1.25 });
      else m = M.buildYorkie({ tan: r.fur, bow: r.bow, scale: 1.35 });
      m.position.set(r.x, r.y, r.z);
      sc.add(m); chars.push(m);
      const mark = new THREE.Sprite(nimbusMark.material);
      mark.scale.set(0.7, 0.7, 1); mark.userData.noOutline = true; sc.add(mark);
      return { def: r, m, mark };
    });
    function winDefi(id) {
      const k = sky();
      L.defi = null;
      const first = !k.defis.includes(id);
      if (first) { k.defis.push(id); game.persist(); }
      for (const P of game.players) { P.cheerT = 1.6; P.hearts = Math.max(P.hearts, 3); }
      const r = S.RESIDENTS.find(q => q.defi === id);
      for (let i = 0; i < 6; i++) game.burst(r.x, r.y + 2, r.z, 10, RAINBOW_COLS[i].getHex(), 5, 0.9);
      game.sound('win');
      game.banner('Défi réussi !', first ? `${r.name} est ravi${r.id === 'floconne' || r.id === 'brindille' ? 'e' : ''} : les cœurs sont pleins !` : 'Encore plus vite que la dernière fois !', 3000);
      game.updateHud();
    }
    function talk(r) {
      const k = sky(), done = k.defis.includes(r.defi);
      const ctl = game.controlsHelp();
      if (r.id === 'zephyr') {
        const go = () => {
          for (const [i] of [...L.popped]) if (BL[i].group === 'z') L.popped.delete(i);
          L.defi = { id: 'ballons', end: game.t + S.DEFI_TIME * (game.easy ? 2 : 1), got: new Set() };
          game.banner('Défi des ballons !', `Éclatez les 6 ballons de Zéphyr en ${S.DEFI_TIME * (game.easy ? 2 : 1)} secondes`, 2400);
        };
        if (done) { game.say([{ who: 'Zéphyr', text: 'Six ballons en un clin d\'œil ! Vous êtes les champions du boing. On recommence ?' }], go); return; }
        game.say([
          { who: 'Zéphyr', text: 'Bonjour, les toutous ! Je suis Zéphyr, le marchand de ballons. Le vent en a emporté six autour de l\'île…' },
          { who: 'Zéphyr', text: `Vous voulez jouer ? Éclatez mes six ballons avant la fin du sablier : sautez dessus (${ctl.jump}), ça fait boing !` },
          { who: 'Matcha', text: 'Boing ? J\'adore les boings ! Allez, Ainu !' },
        ], go);
      } else if (r.id === 'floconne') {
        game.say(done ? [{ who: 'Mamie Floconne', text: 'Pompon m\'a tout raconté : vous étiez de très sages passagers. Bêêê !' }] : [
          { who: 'Mamie Floconne', text: 'Bêêê… Bonjour, mes petits. Moi, c\'est Mamie Floconne. Mes deux nuages-moutons, Cotonnet et Pompon, se promènent entre les îles.' },
          { who: 'Mamie Floconne', text: 'Montez sur le dos de Pompon, au bord de l\'île : il vous emmène doucement jusqu\'au Jardin Suspendu. Restez bien assis jusqu\'au bout !' },
          { who: 'Ainu', text: 'Un nuage tout doux qui marche dans le ciel… Même moi, je n\'ai pas peur. Ouaf !' },
        ]);
      } else if (r.id === 'pipou') {
        game.say(done ? [{ who: 'Pipou', text: 'Cinq rebonds ! Tu es le roi du trampoline ! Ouaf, ouaf !' }] : [
          { who: 'Pipou', text: 'Coucou ! Moi, c\'est Pipou. Tu vois mon nuage-trampoline, au milieu de l\'île ? Personne n\'a jamais fait cinq rebonds d\'affilée dessus !' },
          { who: 'Pipou', text: 'Saute dessus, et ne touche pas l\'herbe entre deux rebonds. Tu y arrives ?' },
        ], () => { L.bounces = 0; });
      } else {
        game.say([
          { who: 'Brindille', text: 'Hiii ! Le vent du Col m\'a toute ébouriffée !' },
          { who: 'Brindille', text: 'Quand il siffle, cachez-vous derrière un gros rocher. Et tout en bas, au sud, il y a un îlot secret… mais chut !' },
        ]);
      }
    }
    return {
      res, talk,
      step(dt) {
        const t = game.t, players = game.players;
        // ballons
        for (const [i, at] of [...L.popped]) if (t - at > S.BALLOON_BACK && !(L.defi && BL[i].group === 'z')) L.popped.delete(i);
        for (const P of players) {
          if (P.fly) continue;
          const py = P.pos.y + 0.7;
          for (let i = 0; i < BL.length; i++) {
            if (L.popped.has(i)) continue;
            const b = BL[i], y = b.y + Math.sin(t * 1.4 + i) * 0.2;
            if ((P.pos.x - b.x) ** 2 + (py - y) ** 2 + (P.pos.z - b.z) ** 2 < 1.15 * 1.15) pop(i, P);
          }
          // le trampoline de Pipou : des rebonds d'affilée
          if (P === game.me) {
            if (P.onCol && P.onCol === S.TRAMPS[0].col && P.vel.y > 10 && !L.bounced) {
              L.bounced = true; L.bounces++;
              if (L.bounces >= 2 && !sky().defis.includes('rebonds')) game.banner(`Rebonds : ${L.bounces}/${S.DEFI_BOUNCES}`, null, 900);
              if (L.bounces >= S.DEFI_BOUNCES) { L.bounces = 0; winDefi('rebonds'); }
            }
            if (P.vel.y < 0) L.bounced = false;
            if (P.grounded && P.onCol !== S.TRAMPS[0].col) L.bounces = 0;
            // à dos de Pompon, de bout en bout
            const sheep = P.grounded && P.onCol && P.onCol.mover && P.onCol.mover.look === 'sheep' ? P.onCol.mover : null;
            if (sheep) {
              if (L.rideOf !== sheep) { L.rideOf = sheep; L.ride = 0; if (!st.sheepTold) { st.sheepTold = true; game.banner('Un nuage-mouton !', `${sheep.name} vous emmène en promenade. Bêêê !`, 2400); } const a = aud(); if (a) a.tone(330, 0.5, { type: 'sawtooth', to: 300, vol: 0.05 }); }
              L.ride += dt;
              if (sheep === S.SHEEP[1] && L.ride > S.SHEEP[1].period / 2 - 1.5 && !L.rideWon) { L.rideWon = true; winDefi('mouton'); }
            } else if (P.grounded) { L.rideOf = null; L.ride = 0; L.rideWon = false; }
          }
        }
        if (L.defi && t > L.defi.end) { L.defi = null; game.banner('Presque !', 'Reparlez à Zéphyr pour réessayer', 2200); }
        // papillons : ils s'enfuient quand un chien arrive
        for (const b of BF) {
          b.flee = Math.max(0, b.flee - dt);
          if (b.flee <= 0) for (const P of players) if ((P.pos.x - b.h.x) ** 2 + (P.pos.z - b.h.z) ** 2 < 16 && Math.abs(P.pos.y - b.h.y) < 4) b.flee = 3.5;
        }
        // oiseaux : ils s'envolent en piaillant
        for (const b of BD) {
          b.fly = Math.max(0, b.fly - dt);
          if (b.fly <= 0) for (const P of players) if ((P.pos.x - b.x) ** 2 + (P.pos.z - b.z) ** 2 < 25 && Math.abs(P.pos.y - b.f.y) < 3) {
            for (const q of BD) if (q.f === b.f) q.fly = 7 + Math.random();
            const a = aud(); if (a && P === game.me) for (let k = 0; k < 4; k++) a.tone(2400 + k * 300, 0.05, { type: 'sine', to: 3200, vol: 0.035, delay: k * 0.07 });
            break;
          }
        }
      },
      render(dt, t) {
        // ballons
        BL.forEach((b, i) => {
          const at = L.popped.get(i);
          const k = at === undefined ? 1 : clamp((t - at - (S.BALLOON_BACK - 0.6)) / 0.6, 0, 1);
          const show = k > 0.01 && near(b.x, b.z, 110);
          const y = b.y + Math.sin(t * 1.4 + i) * 0.2;
          dm.position.set(b.x + Math.sin(t * 0.7 + i) * 0.1, y, b.z); dm.rotation.set(0, 0, Math.sin(t + i) * 0.1); dm.scale.setScalar(show ? k : 0);
          dm.updateMatrix(); bMesh.setMatrixAt(i, dm.matrix);
          dm.position.y = y - 0.62; dm.rotation.set(0, 0, 0); dm.updateMatrix(); sMesh.setMatrixAt(i, dm.matrix);
        });
        bMesh.instanceMatrix.needsUpdate = true; sMesh.instanceMatrix.needsUpdate = true;
        // papillons
        BF.forEach((b, i) => {
          const show = near(b.h.x, b.h.z, 70);
          if (!show) { dm.scale.setScalar(0); dm.updateMatrix(); wMesh.setMatrixAt(i * 2, dm.matrix); wMesh.setMatrixAt(i * 2 + 1, dm.matrix); return; }
          const a = t * b.sp + b.ph, f = b.flee > 0 ? (3.5 - b.flee) : 0;
          const x = b.h.x + Math.cos(a) * b.r + Math.sin(a * 2.3) * 0.4 + Math.cos(b.ph) * f * 2.5;
          const z = b.h.z + Math.sin(a * 1.3) * b.r + Math.sin(b.ph) * f * 2.5;
          const y = b.h.y + Math.sin(a * 2.1) * 0.35 + f * 1.6;
          const flap = Math.sin(t * (b.flee > 0 ? 26 : 13) + b.ph) * 0.9, head = a + Math.PI / 2;
          for (const s of [-1, 1]) {
            dm.position.set(x, y, z);
            dm.rotation.set(0, head + (s < 0 ? Math.PI : 0), s * flap, 'YXZ');
            dm.scale.set(0.9, 0.9, 0.9);
            dm.updateMatrix(); wMesh.setMatrixAt(i * 2 + (s < 0 ? 0 : 1), dm.matrix);
          }
        });
        wMesh.instanceMatrix.needsUpdate = true;
        // oiseaux
        BD.forEach((b, i) => {
          const show = near(b.x, b.z, 70);
          let x = b.x, y = b.f.y + 0.13, z = b.z, yaw = b.a, wing = 0.15;
          if (b.fly > 0) {
            const k = Math.min(1, (7 - b.fly) * 0.8), land = Math.min(1, b.fly * 0.8), up = Math.min(k, land);
            const a = t * 1.6 + b.ph;
            x = b.x + Math.cos(a) * 3.5 * up; z = b.z + Math.sin(a) * 3.5 * up; y += up * (4 + Math.sin(t * 3 + b.ph));
            yaw = -a; wing = 0.4 + Math.abs(Math.sin(t * 22 + b.ph)) * 1.4;
          } else { b.peck = Math.sin(t * 2.5 + b.ph * 3); y += Math.max(0, Math.sin(t * 5 + b.ph * 2) - 0.85) * 1.2; }
          dm.position.set(x, y, z); dm.rotation.set(b.fly > 0 ? 0 : Math.max(0, b.peck) * 0.5, yaw, 0); dm.scale.setScalar(show ? 1 : 0);
          dm.updateMatrix(); bbMesh.setMatrixAt(i, dm.matrix);
          dm.scale.set(show ? 1 : 0, show ? wing : 0, show ? 1 : 0); dm.position.y += 0.06; dm.updateMatrix(); bwMesh.setMatrixAt(i, dm.matrix);
        });
        bbMesh.instanceMatrix.needsUpdate = true; bwMesh.instanceMatrix.needsUpdate = true;
        // habitants : ils regardent le chien, remuent la queue ; un « ! » tant que le défi n'est pas fait
        const me = game.me, k = sky();
        for (const r of res) {
          const vis = near(r.def.x, r.def.z, 100);
          r.m.visible = vis;
          const u = r.m.userData;
          if (vis && me && Math.hypot(me.pos.x - r.def.x, me.pos.z - r.def.z) < 12) {
            let d = Math.atan2(me.pos.x - r.def.x, me.pos.z - r.def.z) - r.m.rotation.y;
            d = Math.atan2(Math.sin(d), Math.cos(d));
            r.m.rotation.y += clamp(d, -dt * 3, dt * 3);
          }
          if (u.mtail) u.mtail.rotation.y = Math.sin(t * 8 + r.def.x) * 0.5;
          if (u.mhead) u.mhead.rotation.z = Math.sin(t * 1.7 + r.def.z) * 0.1;
          if (r.def.model === 'sheep') r.m.children[0].position.y = 1.15 + Math.abs(Math.sin(t * 1.5)) * 0.06;
          r.mark.visible = vis && !!r.def.defi && !k.defis.includes(r.def.defi);
          r.mark.position.set(r.def.x, r.def.y + 2.4 + Math.sin(t * 4 + r.def.x) * 0.12, r.def.z);
        }
      },
      snapshot() { return [...L.popped.keys()]; },
      apply(list) {
        if (!list) return;
        const want = new Set(list);
        for (const i of want) if (!L.popped.has(i)) { L.popped.set(i, game.t); game.burst(BL[i].x, BL[i].y, BL[i].z, 10, BL[i].color, 4, 0.4); }
        for (const [i] of [...L.popped]) if (!want.has(i)) L.popped.delete(i);
      },
    };
  })();

  // petits décors lointains : on ne les dessine pas (le téléphone dit merci)
  const farCull = [
    ...bells.map(b => [b.grp, b.def.x, b.def.z, 150]),
    ...cannons.flatMap(c => [[c.grp, c.def.x, c.def.z, 150], [c.ring, c.def.x, c.def.z, 120]]),
    ...socks.map(k => [k.grp, k.grp.position.x, k.grp.position.z, 120]),
    [nimbus, NB.x, NB.z, 110], [gate, gate.position.x, gate.position.z, 180],
  ];

  // --- la vie du parcours -----------------------------------------------------------
  const cpOf = (id) => S.CHECKPOINTS[id] || S.CHECKPOINTS[0];
  const hasFlag = (id) => sky().flags.includes(id);
  function reachCheckpoint(id, P) {
    if (id === st.cp) return;
    st.cp = id; sky().cp = id;
    if (!hasFlag(id)) {
      sky().flags.push(id);
      const f = flags[id]; f.raisedAt = game.t;
      game.sound('reveal');
      game.burst(f.g.position.x, f.g.position.y + 3.6, f.g.position.z, 24, 0xffe070, 4, 0.8);
      const c = cpOf(id);
      if (id !== 14) game.banner('Drapeau !', `${c.name} : en cas de chute, on repart d'ici.`, 2000);
    }
    game.persist();
    void P;
  }
  function respawnAt(P, why) {
    P.fly = null;
    // Promenade : on revient juste là où on avait pied
    if (why === 'fall' && game.easy && P.lastSafe && P.lastSafe.y > S.KILL_Y + 2) {
      P.pos.copy(P.lastSafe); P.pos.y += 0.3; P.vel.set(0, 0, 0); P.invuln = 1.2; P.dashT = 0; P.grounded = false;
      game.burst(P.pos.x, P.pos.y + 1, P.pos.z, 18, 0xbfe8ff, 3, 0.6);
      game.sound('poof');
      return;
    }
    // Défi : chaque chute coûte un cœur ; plus de cœurs = drapeau d'avant
    if (why === 'fall' && game.mode === 'defi') {
      P.hearts--;
      if (P.hearts <= 0) {
        P.hearts = 2;
        if (st.cp > 0) { st.cp = cpOf(st.cp).back; sky().cp = st.cp; game.persist(); }
        game.banner('Plus de cœurs !', 'Retour au drapeau d\'avant', 1800);
        why = 'ko';
      }
      game.updateHud();
    }
    const c = cpOf(st.cp);
    const i = P.id || 0;
    P.pos.set(c.x + Math.cos(i * 1.3) * 1.4, c.y + 0.3, c.z + Math.sin(i * 1.3) * 1.4);
    P.vel.set(0, 0, 0); P.invuln = 1.5; P.dashT = 0; P.grounded = false;
    P.lastSafe.copy(P.pos);
    if (P === game.me) { game.camYaw = Math.PI * 2; game.camInit = false; }
    game.burst(P.pos.x, P.pos.y + 1, P.pos.z, 18, 0xbfe8ff, 3, 0.6);
    if (why === 'fall') {
      game.sound('poof');
      const who = game.party.size > 1 ? P.name : 'Ainu et Matcha';
      game.banner('Oups !', `${who} ${game.party.size > 1 ? 'revient' : 'reviennent'} au drapeau.`, 1400);
    }
  }
  function setBridge(state, until) {
    st.bridge = state; st.bridgeUntil = until || 0;
    S.bridgeCol.off = state === 'off';
    if (state === 'on' && !sky().bridge) { sky().bridge = true; game.persist(); }
  }
  setBridge(st.bridge);
  syncRibbons(true);

  function finishRun() {
    st.running = false; st.finished = true;
    const tm = Math.round(st.runT), k = sky();
    const best = !k.best || tm < k.best;
    if (best) { k.best = tm; game.persist(); }
    game.sound('win');
    for (const P of game.players) P.cheerT = 1.4;
    const A = S.FINISH;
    for (let i = 0; i < 4; i++) game.burst(A.x + (i - 1.5) * 2, A.y + 5, A.z, 20, [0xff5a6a, 0xffd23a, 0x5ac8ff, 0x8ae05a][i], 5, 1.0);
    game.banner(`Arrivée : ${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}`, best ? 'Nouveau record !' : `Record : ${Math.floor(k.best / 60)}:${String(k.best % 60).padStart(2, '0')}`, 3000);
  }
  const headHeight = (Q) => (Q.mesh && Q.mesh.userData.ainu ? 1.45 : (Q.mesh && Q.mesh.userData.height) || 1.0);
  const sfx = () => (game.sfx && game.sfx.ok ? game.sfx : null);
  const bellName = (id) => S.BELLS.find(b => b.id === id).name;

  /** Une cloche sonne : un chemin d'arc-en-ciel se dessine (ou le pont, à la troisième). */
  function ringBell(b, P) {
    const k = sky();
    if (k.bells.includes(b.id)) return;
    k.bells.push(b.id);
    st.ringT[b.id] = game.t;
    game.persist();
    syncRibbons(false);
    const s = sfx();
    if (s) [0, 4, 7, 12, 16].forEach((m, i) => s.note('bell', 72 + m + (b.id === 'bleue' ? 2 : b.id === 'or' ? 5 : 0), 0.6, i * 0.14, 0.5));
    game.burst(b.x, b.y + 3, b.z, 36, b.color, 6, 1.0);
    for (const Q of game.players) Q.cheerT = 1.2;
    const n = k.bells.length;
    if (n >= S.BELLS.length) {
      st.pontAt = game.t;
      game.banner('Les trois cloches !', 'Le pont arc-en-ciel se réveille au Carillon !', 3200);
      if (!game.guest && game.party.size <= 1) setTimeout(() => { if (!game.disposed) showBridge(); }, 2600);
    } else {
      game.banner(`Ding, dong ! ${n}/3`, b.id === 'or' ? 'Le Canon du Retour vous ramène au Carillon' : 'Un chemin d\'arc-en-ciel ramène au Carillon', 2800);
    }
    void P;
  }
  /** Petite scène : le pont arc-en-ciel se dessine vers l'Île du Trophée. */
  function showBridge() {
    if (game.cine || game.dialog) { game.say([{ who: 'Nimbus', text: 'Les trois cloches ont sonné ! Le pont arc-en-ciel mène au Trophée : en avant !' }]); return; }
    st.pontAt = game.t;
    const R = S.RAINBOW.pts, a = R[0], b = R[R.length - 1];
    const shots = [
      { d: 5.5, from: [a.x + 9, a.y + 5, a.z + 10], to: [a.x + 7, a.y + 9, a.z - 4], look: [a.x, a.y + 1, a.z - 8], lookTo: [b.x, b.y + 2, b.z],
        say: { who: 'Nimbus', text: 'Les trois cloches ont sonné ! Le pont arc-en-ciel mène au Trophée : en avant !' } },
    ];
    game.dialog = null;
    game.cine = new Cinema(game, shots, () => { game.cine = null; });
  }

  /** Nimbus parle (première rencontre, puis des astuces selon les cloches). */
  function talkNimbus() {
    const k = sky();
    const ctl = game.controlsHelp();
    if (!k.nimbus) {
      game.say([
        { who: 'Nimbus', text: 'Ohé, les toutous ! Bienvenue sur l\'Île du Carillon. Moi, c\'est Nimbus, le gardien des cloches du ciel.' },
        { who: 'Matcha', text: 'Le Trophée est là-haut, sur la plus haute île ? Mais… il n\'y a pas de pont !' },
        { who: 'Nimbus', text: 'Il y en a un, mais il dort. C\'est un pont arc-en-ciel : il ne se réveille que si les trois cloches du ciel sonnent.' },
        { who: 'Nimbus', text: 'La Cloche Rose est à l\'ouest, après les nuages-trampolines. La Bleue est à l\'est, au Col des Rafales.' },
        { who: 'Nimbus', text: 'Et la Cloche d\'Or… il faut prendre le Tourniquet, la Grande Roue, et puis… le canon !' },
        { who: 'Ainu', text: 'Le… canon ? Ouaf. On y va doucement, d\'accord ?' },
        { who: 'Nimbus', text: 'Promis, il est tout doux. Chaque cloche dessine un chemin pour revenir ici : vous ne serez jamais perdus.' },
        { who: 'Nimbus', text: 'Et si vous trouvez mes six plumes arc-en-ciel, envolées un peu partout, je vous apprends un secret de planeur !' },
      ], () => { k.nimbus = true; game.persist(); game.updateHud(); game.banner('Sonnez les trois cloches !', 'Ouest, est, nord-ouest : dans l\'ordre que vous voulez', 2800); });
      return;
    }
    const n = k.bells.length, f = k.feathers.length;
    if (n >= S.BELLS.length) {
      game.say([{ who: 'Nimbus', text: f >= S.FEATHERS.length ? 'Le pont vous attend ! Et quel bel arc-en-ciel quand vous planez…' : `Le pont vous attend ! Il me manque encore ${S.FEATHERS.length - f} plume${S.FEATHERS.length - f > 1 ? 's' : ''}, si vous les voyez…` }]);
      return;
    }
    const left = S.BELLS.filter(b => !k.bells.includes(b.id)).map(b => b.id);
    const hint = left[0] === 'rose' ? 'Pour la Cloche Rose : sautez sur un nuage-trampoline, et visez le suivant. Boing, boing !'
      : left[0] === 'bleue' ? 'Pour la Cloche Bleue : quand le vent siffle, cachez-vous derrière un gros rocher, et attendez qu\'il se calme.'
        : `Pour la Cloche d'Or : montez dans une nacelle de la Grande Roue quand elle passe au bord, puis sautez sur l'Île du Canon.`;
    game.say([
      { who: 'Nimbus', text: n ? `Déjà ${n} cloche${n > 1 ? 's' : ''} sur 3 ! Écoutez comme le ciel chante.` : 'Les trois cloches attendent ! Ouest, est, ou nord-ouest : à vous de choisir.' },
      { who: 'Nimbus', text: hint },
    ]);
    void ctl;
  }

  // le combat final contre la Capitaine, sur l'Île du Trophée
  const boss = buildSkyBoss(game, S, sky);

  /** Le chemin d'étincelles (Promenade) : prochain point d'une route. */
  function along(route, P) {
    let bi = 0, bd = Infinity;
    route.forEach((w, i) => { const d = Math.hypot(w[0] - P.pos.x, w[1] - P.pos.z) + Math.abs((w[2] || P.pos.y) - P.pos.y); if (d < bd) { bd = d; bi = i; } });
    let i = bi;
    if (i + 1 < route.length) {
      const w = route[i], n = route[i + 1], vx = n[0] - w[0], vz = n[1] - w[1], l = Math.hypot(vx, vz) || 1;
      if (((P.pos.x - w[0]) * vx + (P.pos.z - w[1]) * vz) / l > -2 || bd < 3) i++;
    }
    const w = route[i];
    return { x: w[0], z: w[1], y: w[2] !== undefined ? w[2] : S.heightAt(w[0], w[1]) };
  }
  const TR = S.TRAMPS, CN = S.CANNONS;
  const ROUTES = {
    rose: [[0, -102], [-17.3, -102], [-30, -100], [TR[1].x, TR[1].z, TR[1].top], [TR[2].x, TR[2].z, TR[2].top], [TR[3].x, TR[3].z, TR[3].top], [S.BELLS[0].x, S.BELLS[0].z]],
    bleue: [[0, -102], [17.3, -102], [28.5, -100], ...S.GUST_PADS.slice(0, 4).map(p => [p.x, p.z, p.top]), [64, -102], ...S.GUST_PADS.slice(4).map(p => [p.x, p.z, p.top]), [S.BELLS[1].x, S.BELLS[1].z]],
    or: [[0, -102], [-12.5, -112.5, 34.4], [TS.x, TS.z, TS.top], [-22, -131.5], [-22, -138.5], [-22, -153], [CN[0].x, CN[0].z], [S.BELLS[2].x, S.BELLS[2].z]],
    pont: [[0, -104], ...S.RAINBOW.pts.filter((_, i) => i % 6 === 0).map(p => [p.x, p.z, p.y]), [0, -164]],
  };

  const logic = {
    moving, chars, boss,
    step(dt) {
      const t = game.t, players = game.players, k = sky();
      S.updateMovers(t);
      // chrono : il part quand on quitte l'île du départ, s'arrête sous l'arche d'arrivée
      if (!st.running && players.some(p => p.pos.z < 82 && p.pos.z > 40)) { st.running = true; st.runT = 0; }
      if (st.running) {
        st.runT += dt;
        const F = S.FINISH;
        if (players.some(p => Math.abs(p.pos.x - F.x) < 3 && p.pos.z < F.z && p.pos.z > F.z - 3 && p.pos.y > F.y - 3)) finishRun();
      }
      // retour à l'île du départ : un nouveau chrono pourra partir
      if (!st.running && st.finished && players.every(p => p.pos.z > 84)) st.finished = false;
      // rafales : alerte, puis souffle
      S.GUSTS.forEach((g, i) => {
        const s = S.gustState(g, t), was = st.gust[i];
        st.gust[i] = s;
        if (s === was) return;
        const me = game.me, inZone = me && me.pos.x > g.x0 - 8 && me.pos.x < g.x1 + 8 && me.pos.z > g.z0 - 8 && me.pos.z < g.z1 + 8 && me.pos.y > g.y0 - 4;
        if (!inZone) return;
        const a = sfx();
        if (s === 1) {
          if (a) a.tone(700, 0.9, { type: 'sine', to: 1300, vol: 0.05 });
          if (!st.gustTold) { st.gustTold = true; game.banner('Le vent siffle…', 'Une rafale arrive : abritez-vous derrière un gros rocher !', 2600); }
        } else if (s === 2 && a) a.noise(1.6, { filter: 'bandpass', freq: 420, freqTo: 1300, vol: 0.28 });
      });
      for (const P of players) {
        if (P.fly) continue;
        // chute dans le vide (et plus besoin de planer jusqu'en bas : on revient dès qu'on est perdu)
        if (P.pos.y < S.KILL_Y || (!P.grounded && P.pos.y < P.lastSafe.y - 10 && S.supportAt(P.pos.x, P.pos.z, P.pos.y, t).y < S.KILL_Y && !S.UPDRAFTS.some(u => Math.hypot(P.pos.x - u.x, P.pos.z - u.z) < u.r + 3))) { respawnAt(P, 'fall'); continue; }
        // drapeaux
        for (const c of S.CHECKPOINTS) if (c.id !== st.cp && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 4.5 && Math.abs(P.pos.y - c.y) < 3) reachCheckpoint(c.id, P);
        // colonnes de vent : elles portent tout le monde jusqu'en haut (sans rien tenir appuyé),
        // puis on flotte au sommet le temps de choisir où planer
        for (const u of S.UPDRAFTS) {
          if (P.pos.y < u.y0 - 1 || P.pos.y > u.y1 + 1.5) continue;
          const d = Math.hypot(P.pos.x - u.x, P.pos.z - u.z);
          if (d > u.r + 0.3) continue;
          const top = u.y1 - P.pos.y;
          const want = top > 3 ? 11 : top > 0 ? 1 + top * 3 : -1.5;          // vitesse de montée voulue
          if (P.grounded && want > 0) { P.grounded = false; P.vel.y = Math.max(P.vel.y, 4); }
          P.vel.y += (32 + (want - P.vel.y) * 6) * dt;                           // compense la pesanteur
          P.jumps = Math.min(P.jumps, 1); P.coyote = 0;                           // le double saut reste possible en sortant
          if (Math.random() < dt * 30) game.spawnParticle(P.pos.x + (Math.random() - 0.5) * 1.2, P.pos.y - 0.5, P.pos.z + (Math.random() - 0.5) * 1.2, 0, 8, 0, 0xe0f8ff, 0.22, 0.5, 0);
          if (!P.windT || game.t - P.windT > 1.2) { P.windT = game.t; if (P === game.me) game.sound('dash'); }
          if (!st.windTold && P === game.me) { st.windTold = true; game.banner('Courant d\'air !', 'Il vous monte tout en haut : sortez-en en planant', 2200); }
        }
        // rafales du Col : elles poussent (sauf derrière un rocher-abri)
        const g = S.gustAt(P.pos.x, P.pos.y, P.pos.z);
        if (g && st.gust[S.GUSTS.indexOf(g)] === 2 && !S.sheltered(g, P.pos.x, P.pos.z)) {
          const str = (game.easy ? 2.4 : game.mode === 'defi' ? 6.6 : 5.2) * g.k * (P.gliding ? 1.35 : 1);
          const nx = { x: P.pos.x + g.dx * str * dt, z: P.pos.z + g.dz * str * dt };
          game.pushOut(nx, P.pos.y);
          P.pos.x = nx.x; P.pos.z = nx.z;
          if (Math.random() < dt * 14) game.spawnParticle(P.pos.x - g.dx * 3 + (Math.random() - 0.5) * 3, P.pos.y + 0.4 + Math.random() * 1.5, P.pos.z - g.dz * 3 + (Math.random() - 0.5) * 3, g.dx * 9, 0.3, g.dz * 9, Math.random() < 0.5 ? 0x7ac850 : 0xf0c8e0, 0.16, 0.7, 0);
          if (!st.pushTold && P === game.me) { st.pushTold = true; game.banner('Rafale !', 'Elle pousse fort : marchez contre le vent, ou cachez-vous !', 2400); }
        }
        // le Tourniquet emporte ceux qui sont dessus
        if (P.grounded && P.onCol === S.turnCol && S.turnCol.da) {
          const dx = P.pos.x - TS.x, dz = P.pos.z - TS.z, c = Math.cos(S.turnCol.da), s = Math.sin(S.turnCol.da);
          P.pos.x = TS.x + dx * c - dz * s; P.pos.z = TS.z + dx * s + dz * c;
          if (!st.turnTold && P === game.me) { st.turnTold = true; game.banner('Le Tourniquet !', 'Il tourne tout doucement : laissez-vous porter', 2200); }
        }
        // nuages-trampolines et Grande Roue : on prévient la première fois
        if (P === game.me && P.onCol && P.onCol.tramp && !st.trampTold) { st.trampTold = true; game.banner('Nuage-trampoline !', 'Boing ! Visez le nuage suivant pendant le saut', 2400); }
        if (P === game.me && P.onCol && P.onCol.mover && P.onCol.mover.gondola && !st.wheelTold) { st.wheelTold = true; game.banner('La Grande Roue des Nuages', 'Restez dans la nacelle : elle monte vers l\'Île du Canon', 2400); }
        // les cloches : il suffit de passer dessous
        for (const b of S.BELLS) if (!k.bells.includes(b.id) && Math.hypot(P.pos.x - b.x, P.pos.z - b.z) < 1.7 && Math.abs(P.pos.y - b.y) < 2.5) ringBell(b, P);
        // canons : on se met sur la cible, on attend un peu… BOUM !
        for (const c of cannons) {
          const C = c.def, on = P.grounded && Math.hypot(P.pos.x - C.x, P.pos.z - C.z) < C.r && Math.abs(P.pos.y - C.y) < 1.2;
          if (!P.cannon) P.cannon = {};
          if (!on) { P.cannon[C.id] = 0; continue; }
          const before = P.cannon[C.id] || 0;
          P.cannon[C.id] = before + dt;
          const a = sfx();
          if (a && P === game.me && Math.floor(before / 0.3) !== Math.floor(P.cannon[C.id] / 0.3)) a.tone(440 + Math.floor(P.cannon[C.id] / 0.3) * 160, 0.12, { type: 'square', vol: 0.06 });
          if (before === 0 && P === game.me && !st.cannonTold) { st.cannonTold = true; game.banner(C.name + ' !', 'Ne bougez plus… 3, 2, 1…', 1600); }
          if (P.cannon[C.id] >= S.CANNON_WAIT) {
            P.cannon[C.id] = 0;
            P.fly = { c: C, t: 0 };
            c.fireT = t;
            if (a) { a.noise(0.6, { freq: 900, freqTo: 120, vol: 0.5 }); a.tone(110, 0.4, { type: 'sawtooth', to: 50, vol: 0.18 }); }
            game.burst(C.x + c.ux * 0.5, C.y + 2.2, C.z + c.uz * 0.5, 30, 0xffffff, 5, 0.8);
            game.burst(C.x, C.y + 2.2, C.z, 14, 0xffd060, 4, 0.6);
            if (P === game.me) game.kick(0.3, 0.1);
          }
        }
        // plumes arc-en-ciel
        for (const f of feathers) {
          if (k.feathers.includes(f.def.id)) continue;
          const d = f.def;
          if ((P.pos.x - d.x) ** 2 + (P.pos.y + 0.6 - d.y) ** 2 + (P.pos.z - d.z) ** 2 < 1.7 * 1.7) {
            f.grp.visible = false;
            k.feathers.push(d.id);
            game.persist();
            const n = k.feathers.length, all = n >= S.FEATHERS.length;
            game.burst(d.x, d.y, d.z, 28, 0xffffff, 4, 0.8);
            for (let i = 0; i < 6; i++) game.burst(d.x, d.y, d.z, 4, RAINBOW_COLS[i].getHex(), 3, 0.7);
            const a = sfx(); if (a) [0, 3, 7, 10, 14].forEach((m, i) => a.note('mallet', 79 + m, 0.12, i * 0.06, 0.4));
            if (P.hearts < 3) P.hearts++;
            game.banner(all ? 'Les six plumes de Nimbus !' : `Plume arc-en-ciel ${n}/${S.FEATHERS.length}`, all ? 'Retournez voir Nimbus au Carillon !' : d.label, 2600);
            game.updateHud();
          }
        }
        // toutes les plumes rendues à Nimbus : on plane en laissant un arc-en-ciel
        if (P.gliding && k.rainbowTrail && Math.random() < dt * 40) {
          const c = RAINBOW_COLS[Math.floor(Math.random() * 6)];
          game.spawnParticle(P.pos.x + (Math.random() - 0.5) * 0.6, P.pos.y + 0.6, P.pos.z + (Math.random() - 0.5) * 0.6, 0, -0.3, 0, c.getHex(), 0.22, 1.1, 0);
        }
        // rebond sur la tête d'un ami
        if (P.vel.y < -2 && game.party.size > 1) {
          for (const Q of players) {
            if (Q === P || Q.ko) continue;
            const hy = Q.pos.y + headHeight(Q);
            if (Math.hypot(P.pos.x - Q.pos.x, P.pos.z - Q.pos.z) < 0.95 && P.pos.y < hy + 0.35 && P.pos.y > hy - 0.45) {
              P.pos.y = hy; P.vel.y = 15.5; P.jumps = 1; P.grounded = false; P.coyote = 0;
              Q.cheerT = 0.5;
              game.sound('boing');
              game.burst(P.pos.x, hy, P.pos.z, 12, 0xfff0a0, 3.5, 0.45);
              if (!st.bounceTold) { st.bounceTold = true; game.banner('Saut des copains !', 'Rebondir sur un ami fait monter très haut', 2000); }
              break;
            }
          }
        }
      }
      // première visite au Carillon : Nimbus vient dire bonjour
      const me = game.me;
      if (me && !k.nimbus && !game.dialog && !game.cine && !game.guest && Math.hypot(me.pos.x - S.NIMBUS.x, me.pos.z - S.NIMBUS.z) < 9 && Math.abs(me.pos.y - S.NIMBUS.y) < 3) talkNimbus();
      // les six plumes rendues : Nimbus apprend le planeur arc-en-ciel
      if (me && k.nimbus && k.feathers.length >= S.FEATHERS.length && !k.rainbowTrail && !game.dialog && !game.cine && !game.guest && Math.hypot(me.pos.x - S.NIMBUS.x, me.pos.z - S.NIMBUS.z) < 6 && Math.abs(me.pos.y - S.NIMBUS.y) < 3) {
        k.rainbowTrail = true; game.persist();
        game.say([
          { who: 'Nimbus', text: 'Mes six plumes arc-en-ciel ! Vous les avez toutes retrouvées ? Merci, merci !' },
          { who: 'Nimbus', text: 'Voici mon secret de planeur : maintenant, quand Ainu plane, il laisse un arc-en-ciel derrière lui.' },
          { who: 'Ainu', text: 'Un arc-en-ciel… rien que pour nous ? Ouaf ! Matcha, regarde-moi planer !' },
        ]);
      }
      life.step(dt);
      boss.step(dt);
      // nuages fragiles
      st.crumble.forEach((c, i) => {
        const def = S.crumbles[i];
        if (c.s === 'idle') {
          if (players.some(p => p.grounded && p.onCol === def.col)) { c.s = 'shake'; c.t = 0; game.sound('poof'); }
        } else {
          c.t += dt;
          if (c.s === 'shake' && c.t > S.CRUMBLE_TIME) { c.s = 'fall'; c.t = 0; def.col.off = true; }
          else if (c.s === 'fall' && c.t > S.CRUMBLE_BACK) { c.s = 'idle'; c.t = 0; def.col.off = false; }
        }
      });
      // Pont des Copains
      const pressed = S.PLATES.map(p => players.some(q => Math.hypot(q.pos.x - p.x, q.pos.z - p.z) < 1.25 && Math.abs(q.pos.y - p.y) < 0.9));
      const was = st.plates;
      st.plates = pressed;
      pressed.forEach((on, i) => { if (on && !was[i]) game.sound('switch'); });
      if (st.bridge !== 'on') {
        const n = pressed.filter(Boolean).length;
        if (n >= 2) {
          setBridge('on');
          game.sound('reveal');
          game.banner('Le Pont des Copains !', 'Bravo l\'équipe : il reste sorti pour de bon !', 2800);
          for (const P of players) P.cheerT = 1.2;
        } else if (n === 1) {
          const solo = players.length === 1;
          if (st.bridge === 'off') {
            const dur = (solo ? S.BRIDGE_SOLO_TIME : S.BRIDGE_SOLO_TIME - 2) + (game.easy ? 6 : game.mode === 'defi' ? -2 : 0);
            setBridge('timed', t + dur);
            if (!solo && t - st.plateHintT > 8) { st.plateHintT = t; game.banner('Il faut être deux !', 'Un ami sur l\'autre dalle, et le pont reste pour de bon', 2400); }
            else if (solo && !st.soloHint) { st.soloHint = true; game.banner('Vite !', `Le pont ne reste que ${Math.round(dur)} secondes`, 2000); }
          } else st.bridgeUntil = Math.max(st.bridgeUntil, t + 1.5);
        }
        if (st.bridge === 'timed' && t > st.bridgeUntil) setBridge('off');
      }
    },
    /** Vol en canon : le chien suit la parabole jusqu'à l'île d'en face. */
    playerStep(P, wx, wz, jumpHeld, pr, dt) {
      const F = P.fly;
      if (!F) return false;
      F.t += dt;
      const C = F.c, k = Math.min(1, F.t / C.T), p = S.cannonAt(C, k), q = S.cannonAt(C, Math.min(1, k + 0.02));
      P.vel.set((q.x - p.x) / (C.T * 0.02), (q.y - p.y) / (C.T * 0.02), (q.z - p.z) / (C.T * 0.02));
      P.pos.set(p.x, p.y, p.z);
      P.yaw = Math.atan2(C.to.x - C.x, C.to.z - C.z);
      P.grounded = false; P.gliding = false; P.flipT = 0.3; P.coyote = 0; P.jumps = 1;
      if (Math.random() < dt * 30) game.spawnParticle(p.x, p.y + 0.5, p.z, 0, 0, 0, 0xffffff, 0.3, 0.6, 0);
      if (k >= 1) {
        P.fly = null;
        P.vel.set(0, -2, 0); P.invuln = 1; P.lastSafe.copy(P.pos);
        game.burst(p.x, p.y + 0.2, p.z, 16, 0xf0e0c0, 3, 0.5);
        game.sound('bump');
      }
      return true;
    },
    extraCandidates() {
      return [{ kind: 'lv', act: 'nimbus', label: 'PARLER', x: S.NIMBUS.x, z: S.NIMBUS.z, y: S.NIMBUS.y },
        ...S.RESIDENTS.map(r => ({ kind: 'lv', act: 'res', id: r.id, label: 'PARLER', x: r.x, z: r.z, y: r.y }))];
    },
    interact(n) { if (n.act === 'nimbus') talkNimbus(); else if (n.act === 'res') life.talk(S.RESIDENTS.find(r => r.id === n.id)); },
    /** Mode Promenade : le chemin d'étincelles mène au prochain drapeau, puis aux cloches, puis au Trophée. */
    guideTarget(me) {
      if (boss.active) return null;
      const k = sky(), P = me || game.me;
      if (save().medals.includes(S.FINAL_MEDAL)) return null;
      if (!hasFlag(5)) {
        const nxt = S.MAIN_PATH.find(id => !hasFlag(id) && id > 0) || 5;
        const c = S.CHECKPOINTS[nxt];
        return { x: c.x, y: c.y, z: c.z };
      }
      if (!k.nimbus) return { x: S.NIMBUS.x, y: S.NIMBUS.y, z: S.NIMBUS.z };
      if (k.bells.length < S.BELLS.length) {
        // la cloche la plus proche… en suivant sa route
        const left = S.BELLS.filter(b => !k.bells.includes(b.id));
        let best = left[0], bd = Infinity;
        for (const b of left) { const d = Math.min(...ROUTES[b.id].slice(1).map(w => Math.hypot(w[0] - P.pos.x, w[1] - P.pos.z))); if (d < bd) { bd = d; best = b; } }
        return along(ROUTES[best.id], P);
      }
      if (boss.done) { const g = S.medals.find(m => m.id === S.FINAL_MEDAL); return g; }
      return along(ROUTES.pont, P);
    },
    camFocus() { return boss.focus(); },
    reveal() { const o = {}; for (const m of S.medals) o[m.id] = true; o[S.FINAL_MEDAL] = boss.done || save().medals.includes(S.FINAL_MEDAL); return o; },
    applySave() {
      boss.sync();
      st.cp = sky().cp;
      if (sky().bridge) setBridge('on');
      syncRibbons(true);
      flags.forEach((f) => { f.raise = hasFlag(f.def.id) ? 1 : 0; });
      for (const f of feathers) f.grp.visible = !sky().feathers.includes(f.def.id);
    },
    respawn() { const c = cpOf(st.cp); return { x: c.x, y: c.y + 0.3, z: c.z, yaw: Math.PI }; },
    questText() {
      const s = save(), k = sky();
      const stars = s.medals.filter(id => id !== S.FINAL_MEDAL).length;
      const tm = Math.floor(st.runT);
      const chrono = `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}`;
      const fe = k.feathers.length ? ` · 🪶 ${k.feathers.length}/${S.FEATHERS.length}` : '';
      if (!s.intro) return 'Parle à Mamie Labrador';
      if (boss.active) return `Combat ! Battez la Capitaine (${boss.hp} coup${boss.hp > 1 ? 's' : ''})`;
      if (boss.done && !s.medals.includes(S.FINAL_MEDAL)) return 'Attrapez le Trophée du Ciel !';
      if (s.medals.includes(S.FINAL_MEDAL)) return `Parcours fini ! ⭐ ${stars}/5${fe}${k.best ? ` · record ${Math.floor(k.best / 60)}:${String(Math.floor(k.best) % 60).padStart(2, '0')}` : ''}`;
      const run = st.running ? ` · ⏱ ${chrono}` : '';
      if (!hasFlag(5)) {
        const nxt = S.CHECKPOINTS[S.MAIN_PATH.find(id => !hasFlag(id) && id > 0) || 5];
        return `Vers : ${nxt.name} · ⭐ ${stars}/5${run}`;
      }
      if (!k.nimbus) return `Parlez à Nimbus, sur l'Île du Carillon · ⭐ ${stars}/5${run}`;
      if (k.bells.length < S.BELLS.length) return `Sonnez les cloches du ciel (${k.bells.length}/3) · ⭐ ${stars}/5${fe}${run}`;
      return `Le pont arc-en-ciel : montez au Trophée ! · ⭐ ${stars}/5${run}`;
    },
    minimapMarks() {
      const out = [];
      S.CHECKPOINTS.forEach((c) => out.push([c.x, c.z, hasFlag(c.id) ? '#ffd23a' : '#ffffff', 2.4, false]));
      const k = sky();
      if (hasFlag(5)) for (const b of S.BELLS) if (!k.bells.includes(b.id)) out.push([b.x, b.z, '#' + b.color.toString(16).padStart(6, '0'), 3.4, true]);
      out.push([S.NIMBUS.x, S.NIMBUS.z, '#e8483a', 3, false]);
      return out;
    },
    snapshot() {
      return { bo: boss.snapshot(), f: st.running ? 1 : 0, cp: st.cp, b: st.bridge === 'on' ? 1 : st.bridge === 'timed' ? Math.round((st.bridgeUntil - game.t) * 10) / 10 : 0, c: st.crumble.map(c => (c.s === 'idle' ? 0 : c.s === 'shake' ? 1 : 2)), r: Math.round(st.runT), p: st.plates.map(Number),
        bl: sky().bells.slice(), fl: game.players.map(P => (P.fly ? 1 : 0)), lb: life.snapshot() };
    },
    apply(x) {
      boss.apply(x.bo);
      life.apply(x.lb);
      if (x.cp !== st.cp && flags[x.cp] && !hasFlag(x.cp)) { flags[x.cp].raisedAt = game.t; sky().flags.push(x.cp); }
      st.cp = x.cp; st.runT = x.r; st.running = !!x.f; st.plates = x.p.map(Boolean);
      if (x.b === 1) setBridge('on'); else if (x.b > 0) setBridge('timed', game.t + x.b); else setBridge('off');
      x.c.forEach((v, i) => { const c = st.crumble[i]; const s = v === 0 ? 'idle' : v === 1 ? 'shake' : 'fall'; if (c.s !== s) { c.s = s; c.t = 0; } S.crumbles[i].col.off = s === 'fall'; });
      if (x.bl) for (const id of x.bl) if (!sky().bells.includes(id)) { sky().bells.push(id); st.ringT[id] = game.t; if (sky().bells.length >= S.BELLS.length) st.pontAt = game.t; syncRibbons(false); }
    },
    talkMamie(first) {
      const s = save();
      const k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Bienvenue dans les Îles du Ciel ! Elles flottent tout là-haut, au-dessus de la mer.' },
          { who: 'Biscotte', text: 'Ouaaah… c\'est haut !' },
          { who: 'Mamie Labrador', text: 'Tout au bout, sur la plus haute île, brille le Trophée du Ciel. Allez le chercher !' },
          { who: 'Mamie Labrador', text: `Pour sauter loin : sautez deux fois (${k.jump}), et gardez le bouton appuyé pour planer avec la queue d'Ainu.` },
          { who: 'Mamie Labrador', text: 'Si vous tombez, pas de panique : vous repartez du dernier drapeau touché.' },
          { who: 'Matcha', text: 'Et si on est plusieurs ? On peut se faire la courte échelle !' },
          { who: 'Mamie Labrador', text: 'Exactement ! Sautez sur la tête d\'un ami pour monter plus haut. Et 5 Étoiles du ciel sont cachées en chemin…' },
          { who: 'Ainu', text: 'C\'est… très haut, Matcha. Mais je te suis. Ouaf !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Cap au nord, jusqu\'au Trophée du Ciel !', 2800); game.updateHud(); });
        return;
      }
      const stars = s.medals.filter(id => id !== S.FINAL_MEDAL).length;
      if (s.medals.includes(S.FINAL_MEDAL)) {
        game.say([{ who: 'Mamie Labrador', text: `Vous avez rapporté le Trophée ! ${stars < 5 ? `Il reste ${5 - stars} étoile${5 - stars > 1 ? 's' : ''} à trouver… et votre record à battre !` : 'Et toutes les étoiles ! Essayez de battre votre record !'}` }]);
        return;
      }
      if (hasFlag(5)) {
        game.say([
          { who: 'Mamie Labrador', text: `Vous avez ${stars} étoile${stars > 1 ? 's' : ''} sur 5. Nimbus, le carlin aviateur, vous attend sur l'Île du Carillon.` },
          { who: 'Mamie Labrador', text: 'Il connaît tous les secrets du ciel… et il a perdu ses plumes arc-en-ciel. L\'une d\'elles est tombée juste sous notre île !' },
        ]);
        return;
      }
      game.say([
        { who: 'Mamie Labrador', text: `Vous avez ${stars} étoile${stars > 1 ? 's' : ''} sur 5. Le Trophée est tout au nord.` },
        { who: 'Mamie Labrador', text: 'Astuce : le grand champignon rose près des pierres envoie très haut… et vers quelque chose qui brille !' },
      ]);
    },
    endLines() {
      const s = save();
      const stars = s.medals.filter(id => id !== S.FINAL_MEDAL).length;
      const tm = Math.round(sky().best || st.runT);
      const kid = window.kidName ? window.kidName() : '';
      return [
        { who: 'Mamie Labrador', text: 'Le Trophée du Ciel ! Vous avez traversé toutes les îles… et battu la Capitaine !' },
        { who: 'Capitaine Moustache', text: 'Miaou… Vous m\'avez suivie jusqu\'au-dessus des nuages, et vous avez dégonflé ma montgolfière. Bon. Je rends tout : les médailles, les trophées…' },
        { who: 'Capitaine Moustache', text: 'Je voulais juste… que quelqu\'un m\'invite à jouer, moi aussi.' },
        { who: 'Mamie Labrador', text: 'Alors c\'est décidé : la pancarte, on l\'enlève. Viens jouer avec nous au Parc des Toutous !' },
        { who: 'Capitaine Moustache', text: '…Jouer ? Avec des chiens ? …D\'accord. Mais c\'est moi qui lance la balle !' },
        { who: 'Nimbus', text: 'Et moi, je ferai sonner les trois cloches du ciel pour la fête !' },
        { who: 'Biscotte', text: 'Moi aussi je veux lancer ! J\'ai sauté comme toi, Ainu !' },
        { who: 'Matcha', text: 'Tu vois, Ainu ? Même tout là-haut, tu n\'as pas eu peur.' },
        { who: 'Ainu', text: 'Parce que vous étiez là. Merci de nous avoir guidés. Ouaf !' },
        ...(kid ? [{ who: '', text: `Et tout ça, grâce à ${kid}.` }] : []),
        { who: 'Biscotte', text: `Record : ${Math.floor(tm / 60)} min ${tm % 60} s, avec ${stars} étoile${stars > 1 ? 's' : ''} sur 5 !` },
      ];
    },
    render(dt, t) {
      boss.render(dt, t);
      life.render(dt, t);
      // plates-formes mobiles (calculées depuis le temps : pareil chez les amis)
      for (const m of movers) {
        const p = S.moverAt(m.def, t);
        m.mesh.position.set(p.x, p.y, p.z);
        if (m.def.look === 'cloud' && !m.def.gondola) m.mesh.rotation.y = t * 0.2;
        if (m.def.look === 'sheep') {
          // il regarde là où il va, et bat des pattes
          const q = S.moverAt(m.def, t + 0.2);
          if (Math.hypot(q.x - p.x, q.z - p.z) > 1e-3) m.mesh.rotation.y = Math.atan2(q.x - p.x, q.z - p.z);
          m.mesh.position.y = p.y + Math.sin(t * 2 + m.def.x0) * 0.05;
          if (m.mesh.userData.face) m.mesh.userData.face.rotation.x = Math.sin(t * 3) * 0.04;
        }
      }
      turn.rotation.y = -S.turnAngle(t);
      wheel.rotation.x = -WH.w * t;
      // nuages fragiles : tremblent, tombent, reviennent
      crumbles.forEach((c, i) => {
        const s = st.crumble[i], d = c.def;
        if (s.s === 'idle') { c.mesh.visible = true; c.mesh.position.set(d.x, d.top + Math.sin(t * 1.5 + i) * 0.04, d.z); c.mesh.material.opacity = Math.min(1, c.mesh.material.opacity + dt * 2); c.mesh.scale.setScalar(1); }
        else if (s.s === 'shake') { c.mesh.position.set(d.x + Math.sin(t * 60) * 0.08, d.top, d.z + Math.cos(t * 55) * 0.08); }
        else { c.mesh.position.y = d.top - s.t * s.t * 6; c.mesh.material.opacity = Math.max(0, 1 - s.t * 1.2); c.mesh.visible = c.mesh.material.opacity > 0.02; if (s.t > S.CRUMBLE_BACK - 0.6) { c.mesh.visible = true; c.mesh.position.y = d.top; c.mesh.material.opacity = (s.t - (S.CRUMBLE_BACK - 0.6)) / 0.6; c.mesh.scale.setScalar(0.6 + c.mesh.material.opacity * 0.4); } }
      });
      // ressorts et trampolines qui s'écrasent
      for (const s of springs) {
        const since = t - (s.def.col.squashT || -9);
        const k = since < 0.45 ? 1 - Math.sin(since / 0.45 * Math.PI) * 0.35 * (1 - since / 0.45) : 1;
        for (const m of s.cap) m.scale.set(2 - k, k, 2 - k);
        if (s.def.look === 'tramp') s.cap[0].position.y = 0.7 + Math.sin(t * 1.6 + s.def.x) * 0.05;
      }
      // vent
      for (const d of drafts) {
        d.tube.material.map.offset.y = -t * 0.9; d.inner.material.map.offset.y = -t * 1.4;
        d.tube.rotation.y = t * 0.6; d.inner.rotation.y = -t * 0.9;
        d.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
      }
      // rafales : manches à air et traînées
      S.GUSTS.forEach((g, i) => {
        const s = S.gustState(g, t), sk = socks[i], tr = streaks[i];
        const blow = s === 2 ? 1 : s === 1 ? 0.35 : 0.08;
        sk.sock.scale.set(0.5 + blow * 0.5, 0.5 + blow * 0.5, 0.35 + blow * 0.65);
        sk.sock.rotation.set((1 - blow) * 1.1 + Math.sin(t * (4 + blow * 10)) * 0.08, g.dz > 0 ? 0 : Math.PI, 0);
        const want = s === 2 ? 0.7 : s === 1 ? 0.22 : 0;
        const mat = tr.mesh.material;
        mat.opacity += (want - mat.opacity) * Math.min(1, dt * 5);
        tr.mesh.visible = mat.opacity > 0.01 && near((g.x0 + g.x1) / 2, (g.z0 + g.z1) / 2, 120);
        if (!tr.mesh.visible) return;
        const L = g.z1 - g.z0, sp = s === 2 ? 22 : 9;
        tr.seeds.forEach((q, k) => {
          const f = ((q.f * L + t * sp * q.sp) % L + L) % L;
          dummy.position.set(q.x, q.y + Math.sin(t * 2 + k) * 0.3, g.dz > 0 ? g.z0 + f : g.z1 - f);
          dummy.scale.set(1, 1, s === 2 ? 1.6 : 0.8);
          dummy.updateMatrix();
          tr.mesh.setMatrixAt(k, dummy.matrix);
        });
        tr.mesh.instanceMatrix.needsUpdate = true;
      });
      // cloches
      const k = sky();
      bells.forEach((b, i) => {
        const rung = k.bells.includes(b.def.id), since = t - (st.ringT[b.def.id] === undefined ? -99 : st.ringT[b.def.id]);
        b.swing.rotation.x = since < 4 ? Math.sin(since * 9) * 0.6 * (1 - since / 4) : rung ? Math.sin(t * 1.5 + i) * 0.04 : 0;
        b.mat.emissiveIntensity = rung ? 0.45 + Math.sin(t * 2 + i) * 0.1 : 0.05 + Math.max(0, Math.sin(t * 3 + i)) * 0.12;
        b.glow.material.opacity = rung ? 0.55 : 0.25 + Math.sin(t * 3 + i) * 0.1;
        b.halo.material.opacity = rung ? 0 : 0.35 + Math.sin(t * 4) * 0.15;
        orbs[i].material.emissiveIntensity = rung ? 1.1 + Math.sin(t * 2.4 + i) * 0.2 : 0;
        orbs[i].material.color.setHex(rung ? S.BELLS[i].color : 0x8a8a9a);
      });
      // chemins d'arc-en-ciel : ils se dessinent depuis la cloche (le pont, depuis le Carillon)
      for (const r of ribbons) {
        const id = r.def.id, on = ribbonOn(id);
        if (on && st.rib[id] < 1) {
          const from = id === 'pont' ? st.pontAt : st.ringT[id];
          st.rib[id] = from === undefined ? 1 : clamp((t - from - (id === 'pont' ? 1.2 : 0.6)) / (id === 'pont' ? 3.5 : 3), 0, 1);
          const P = r.def.pts, tip = P[Math.min(P.length - 1, Math.floor(st.rib[id] * (P.length - 1)))];
          if (st.rib[id] > 0 && Math.random() < 0.6) game.spawnParticle(tip.x, tip.y + 0.3, tip.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, RAINBOW_COLS[Math.floor(Math.random() * 6)].getHex(), 0.25, 0.8, 2);
        }
        if (!on) st.rib[id] = 0;
        const kk = st.rib[id];
        r.mesh.visible = kk > 0.001;
        r.mesh.geometry.setDrawRange(0, Math.floor(kk * r.total / 36) * 36);
      }
      // canons : la cible clignote, le fût recule au tir
      for (const c of cannons) {
        const waiting = game.players.some(P => P.cannon && P.cannon[c.def.id] > 0);
        c.ring.material.opacity = waiting ? 0.6 + Math.sin(t * 20) * 0.35 : 0.85;
        const since = t - c.fireT;
        c.barrel.position.z = since < 0.5 ? -Math.sin(since / 0.5 * Math.PI) * 0.5 : 0;
        c.ring.scale.setScalar(waiting ? 1 + Math.sin(t * 12) * 0.06 : 1);
      }
      // Nimbus regarde le chien le plus proche et remue la queue
      {
        const u = nimbus.userData, me = game.me;
        if (me && Math.hypot(me.pos.x - NB.x, me.pos.z - NB.z) < 14) {
          let d = Math.atan2(me.pos.x - NB.x, me.pos.z - NB.z) - nimbus.rotation.y;
          d = Math.atan2(Math.sin(d), Math.cos(d));
          nimbus.rotation.y += clamp(d, -dt * 2.5, dt * 2.5);
        }
        if (u.mtail) u.mtail.rotation.y = Math.sin(t * 9) * 0.5;
        if (u.mhead) u.mhead.rotation.z = Math.sin(t * 1.3) * 0.08;
        if (u.scarfTail) u.scarfTail.rotation.z = Math.sin(t * 5) * 0.25;
        const ask = !k.nimbus || (k.feathers.length >= S.FEATHERS.length && !k.rainbowTrail);
        nimbusMark.visible = ask;
        nimbusMark.position.set(NB.x, NB.y + 2.6 + Math.sin(t * 4) * 0.12, NB.z);
      }
      for (const [o, x, z, R] of farCull) o.visible = near(x, z, R);
      // plumes
      for (const f of feathers) {
        f.grp.visible = !k.feathers.includes(f.def.id) && near(f.def.x, f.def.z, 130);
        if (!f.grp.visible) continue;
        f.m.rotation.y = t * 1.8; f.m.rotation.z = Math.sin(t * 2 + f.def.x) * 0.3;
        f.grp.position.y = f.def.y + Math.sin(t * 2.2 + f.def.z) * 0.15;
      }
      // drapeaux
      flags.forEach((f, i) => {
        const up = hasFlag(f.def.id) ? 1 : 0;
        f.raise += (up - f.raise) * Math.min(1, dt * 3);
        f.cloth.position.y = 1.0 + f.raise * 2.3;
        f.cloth.material.color.setHex(up ? 0xffffff : 0x9a9a9a);
        const arr = f.cloth.geometry.attributes.position.array;
        for (let q = 0; q < arr.length; q += 3) { const x = f.base[q]; arr[q + 2] = Math.sin(x * 3 - t * 6 + i) * 0.12 * x; }
        f.cloth.geometry.attributes.position.needsUpdate = true;
        const since = t - f.raisedAt;
        f.halo.material.opacity = since < 1.5 ? (1 - since / 1.5) * 0.8 : (f.def.id === st.cp ? 0.25 + Math.sin(t * 3) * 0.08 : 0);
        f.halo.visible = f.halo.material.opacity > 0.01;
        f.halo.scale.setScalar(since < 1.5 ? 1 + since * 2 : 1);
      });
      // dalles et pont
      plates.forEach((p, i) => {
        const on = st.plates[i];
        p.top.position.y += ((on ? 0.2 : 0.32) - p.top.position.y) * Math.min(1, dt * 12);
        p.topMat.map = plateTex[on || st.bridge === 'on' ? 1 : 0];
        p.topMat.emissiveIntensity = on ? 0.6 : st.bridge === 'on' ? 0.25 : 0.05 + Math.sin(t * 3) * 0.05;
        p.glow.material.opacity = on ? 0.55 + Math.sin(t * 8) * 0.1 : 0;
      });
      const target = st.bridge === 'off' ? 0 : 1;
      st.bridgeK += (target - st.bridgeK) * Math.min(1, dt * (target ? 3.5 : 5));
      const blink = st.bridge === 'timed' && st.bridgeUntil - t < 2 && Math.floor(t * 8) % 2 === 0;
      planks.forEach((m, i) => {
        const kk = clamp(st.bridgeK * PLANKS - i, 0, 1);
        m.visible = kk > 0.02;
        m.scale.set(1, 1, Math.max(0.01, kk));
        m.position.y = B.top - 0.11 - (1 - kk) * 0.6;
        m.material = plankMat;
        if (blink) m.visible = m.visible && i % 2 === 0;
      });
      const len = (B.z0 - B.z1) * st.bridgeK;
      for (const r of ropes) { r.m.visible = st.bridgeK > 0.05; r.m.scale.set(1, Math.max(0.01, len), 1); r.m.position.set(B.x + r.sx * (B.w / 2 + 0.2), B.top + 1.2, B.z0 - len / 2); }
      // décor
      blades.rotation.z = t * 0.8;
      for (const b of balloons) { const y = b.y + 3.2 + Math.sin(t * 1.4 + b.ph) * 0.25; b.b.position.set(b.x + Math.sin(t * 0.7 + b.ph) * 0.2, y, b.z); b.string.position.set(b.x, b.y + 1.5, b.z); b.string.scale.y = (y - b.y - 0.5) / 3; }
      crystal.material.emissiveIntensity = 0.55 + Math.sin(t * 1.8) * 0.15;
      for (const sp of cloudSea) { const u = sp.userData; sp.position.set(u.x + Math.sin(t * 0.05 * u.sp + u.ph) * 6, u.y + Math.sin(t * 0.3 + u.ph) * 0.4, u.z); }
      for (const g of farIsles) g.position.y = g.userData.y0 + Math.sin(t * 0.3 + g.userData.ph) * 1.2;
      for (const b of birds) { const u = b.userData, a = u.a + t * u.w; b.position.set(Math.cos(a) * u.R, u.y + Math.sin(t * 2 + u.a) * 0.6, u.cz + Math.sin(a) * u.R); b.rotation.y = -a; b.scale.y = 0.6 + Math.abs(Math.sin(t * 6 + u.a)); }
      seaMat.uniforms.uTime.value = t;
    },
  };
  return logic;
}
