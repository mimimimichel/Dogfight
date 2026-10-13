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
  const sky = () => { const s = save(); if (!s.sky) s.sky = {}; const k = s.sky; if (k.cp === undefined) k.cp = 0; return k; };
  const st = {
    cp: sky().cp, bridge: sky().bridge ? 'on' : 'off', bridgeUntil: 0, bridgeK: sky().bridge ? 1 : 0,
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
  S.ISLANDS.forEach((I, i) => {
    const g = islandMeshes(I, 11 + i * 7, lite);
    for (const [geo, mat] of [[g.under, islandRock], [g.top, islandGrass]]) {
      const m = new THREE.Mesh(geo, mat);
      m.receiveShadow = true; m.castShadow = mat === islandRock && !lite;
      sc.add(m);
    }
    // racines qui pendent sous l'île
    const r = rng(40 + i);
    for (let k = 0; k < Math.round(I.r * 0.8); k++) {
      const a = r() * Math.PI * 2, d = I.r * (0.55 + r() * 0.35), len = 1.5 + r() * I.r * 0.35;
      const root = paint(new THREE.CylinderGeometry(0.05, 0.12, len, 5).translate(0, -len / 2, 0), 0x6a5040);
      unders.push({ geo: root, x: I.x + Math.cos(a) * d, y: I.top - 0.8 - r() * 1.5, z: I.z + Math.sin(a) * d, rz: (r() - 0.5) * 0.3 });
    }
  });
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
  S.pads.forEach((p, i) => {
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
  const movers = S.movers.map((m, i) => {
    let mesh;
    if (m.look === 'cloud') mesh = new THREE.Mesh(cloudGeometry(m.r, 90 + i), cloudMat);
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
  const springs = S.springs.map((s, i) => {
    const g = new THREE.Group();
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
  const flags = S.CHECKPOINTS.map((c, i) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), M.mat(0xf0e6d0, { metalness: 0.3, roughness: 0.4 }));
    pole.position.y = 1.8; g.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), M.mat(0xffd23a, { metalness: 0.6, roughness: 0.3, emissive: 0x6a4800, emissiveIntensity: 0.5 }));
    knob.position.y = 3.65; g.add(knob);
    const clothGeo = new THREE.PlaneGeometry(1.4, 0.75, 10, 4); clothGeo.translate(0.72, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8, color: 0x9a9a9a }));
    cloth.position.y = 1.0; g.add(cloth);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; halo.userData.noOutline = true; g.add(halo);
    g.position.set(c.x + (c.id === 4 ? 1.5 : c.id === 0 ? -3.4 : 2.3), c.y, c.z + (c.id === 0 ? -6 : 0));
    sc.add(g);
    return { def: c, g, cloth, halo, base: clothGeo.attributes.position.array.slice(), raise: i <= st.cp ? 1 : 0, raisedAt: -9 };
  });

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
  if (!S.colliders.some(c => c.kind === 'arch')) S.colliders.push(...[-1, 1].map(sx => ({ type: 'cyl', x: GI.x + sx * 3.2, z: GI.z + 6.5, r: 0.45, y0: GI.top - 1, y1: GI.top + 5.3, kind: 'arch', solid: true })));
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
      const x = (r() - 0.5) * 300, z = 130 - r() * 300;
      if (Math.abs(x) < 22 && z > -120 && z < 110) continue;       // pas sous le parcours (on les verrait de près)
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
    for (let i = 0; i < 9; i++) {
      const side = i % 2 ? 1 : -1, x = side * (45 + r() * 60), z = 110 - i * 26 - r() * 10, rad = 3 + r() * 5, y = 6 + r() * 30;
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

  // --- la vie du parcours -----------------------------------------------------------
  const cpOf = (id) => S.CHECKPOINTS[id] || S.CHECKPOINTS[0];
  function reachCheckpoint(id, P) {
    if (id <= st.cp) return;
    st.cp = id; sky().cp = id; game.persist();
    const f = flags[id]; f.raisedAt = game.t;
    game.sound('reveal');
    game.burst(f.g.position.x, f.g.position.y + 3.6, f.g.position.z, 24, 0xffe070, 4, 0.8);
    const c = cpOf(id);
    if (id < S.CHECKPOINTS.length - 1) game.banner('Drapeau !', `${c.name} : en cas de chute, on repart d'ici.`, 2000);
    void P;
  }
  function respawnAt(P, why) {
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
        if (st.cp > 0) { st.cp--; sky().cp = st.cp; game.persist(); }
        game.banner('Plus de cœurs !', 'Retour au drapeau d\'avant', 1800);
        why = 'ko';
      }
      game.updateHud();
    }
    const c = cpOf(st.cp);
    const i = P.id || 0;
    P.pos.set(c.x + Math.cos(i * 1.3) * 1.4, c.y + 0.3, c.z + Math.sin(i * 1.3) * 1.4);
    P.vel.set(0, 0, 0); P.invuln = 1.5; P.dashT = 0; P.grounded = false;
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

  function finishRun() {
    st.running = false; st.finished = true;
    const tm = Math.round(st.runT), k = sky();
    const best = !k.best || tm < k.best;
    if (best) { k.best = tm; game.persist(); }
    game.sound('win');
    for (const P of game.players) P.cheerT = 1.4;
    const A = S.FINISH;
    for (let i = 0; i < 4; i++) game.burst(A.x + (i - 1.5) * 2, 39, A.z, 20, [0xff5a6a, 0xffd23a, 0x5ac8ff, 0x8ae05a][i], 5, 1.0);
    game.banner(`Arrivée : ${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}`, best ? 'Nouveau record !' : `Record : ${Math.floor(k.best / 60)}:${String(k.best % 60).padStart(2, '0')}`, 3000);
  }
  const headHeight = (Q) => (Q.mesh && Q.mesh.userData.ainu ? 1.45 : (Q.mesh && Q.mesh.userData.height) || 1.0);

  // le combat final contre la Capitaine, sur l'Île du Trophée
  const boss = buildSkyBoss(game, S, sky);

  const logic = {
    moving, chars, boss,
    step(dt) {
      const t = game.t, players = game.players;
      S.updateMovers(t);
      // plates-formes qui tournent : pas de rotation à appliquer (elles glissent), le moteur emporte le chien
      // chrono : il part quand on quitte l'île du départ, s'arrête sous l'arche d'arrivée
      if (!st.running && players.some(p => p.pos.z < 82 && p.pos.z > 40)) { st.running = true; st.runT = 0; }
      if (st.running) {
        st.runT += dt;
        const F = S.FINISH;
        if (players.some(p => Math.abs(p.pos.x - F.x) < 3 && p.pos.z < F.z && p.pos.z > F.z - 3 && p.pos.y > 30)) finishRun();
      }
      // retour à l'île du départ : un nouveau chrono pourra partir
      if (!st.running && st.finished && players.every(p => p.pos.z > 84)) st.finished = false;
      for (const P of players) {
        // chute dans le vide
        if (P.pos.y < S.KILL_Y) { respawnAt(P, 'fall'); continue; }
        // drapeaux
        for (const c of S.CHECKPOINTS) if (c.id > st.cp && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 4.5 && Math.abs(P.pos.y - c.y) < 3) reachCheckpoint(c.id, P);
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
    /** Mode Promenade : le chemin d'étincelles mène au prochain drapeau, puis au Trophée. */
    guideTarget() {
      if (boss.active) return null;
      if (st.cp >= S.CHECKPOINTS.length - 1) { const g = S.medals.find(m => m.id === S.FINAL_MEDAL); return save().medals.includes(g.id) ? null : g; }
      const c = S.CHECKPOINTS[st.cp + 1];
      return { x: c.x, y: c.y, z: c.z };
    },
    camFocus() { return boss.focus(); },
    reveal() { const o = {}; for (const m of S.medals) o[m.id] = true; o[S.FINAL_MEDAL] = boss.done || save().medals.includes(S.FINAL_MEDAL); return o; },
    applySave() {
      boss.sync();
      st.cp = sky().cp;
      if (sky().bridge) setBridge('on');
      flags.forEach((f, i) => { f.raise = i <= st.cp ? 1 : 0; });
    },
    respawn() { const c = cpOf(st.cp); return { x: c.x, y: c.y + 0.3, z: c.z, yaw: Math.PI }; },
    questText() {
      const s = save();
      const stars = s.medals.filter(id => id !== S.FINAL_MEDAL).length;
      const tm = Math.floor(st.runT);
      const chrono = `${Math.floor(tm / 60)}:${String(tm % 60).padStart(2, '0')}`;
      if (!s.intro) return 'Parle à Mamie Labrador';
      if (boss.active) return `Combat ! Battez la Capitaine (${boss.hp} coup${boss.hp > 1 ? 's' : ''})`;
      if (boss.done && !s.medals.includes(S.FINAL_MEDAL)) return 'Attrapez le Trophée du Ciel !';
      if (s.medals.includes(S.FINAL_MEDAL)) return `Parcours fini ! ⭐ ${stars}/5${sky().best ? ` · record ${Math.floor(sky().best / 60)}:${String(Math.floor(sky().best) % 60).padStart(2, '0')}` : ''}`;
      const next = S.CHECKPOINTS[Math.min(st.cp + 1, S.CHECKPOINTS.length - 1)];
      return st.running ? `Vers : ${next.name} · ⭐ ${stars}/5 · ⏱ ${chrono}` : `Vers : ${next.name} · ⭐ ${stars}/5`;
    },
    minimapMarks() {
      const out = [];
      S.CHECKPOINTS.forEach((c, i) => out.push([c.x, c.z, i <= st.cp ? '#ffd23a' : '#ffffff', 2.6, i === st.cp + 1]));
      return out;
    },
    snapshot() {
      return { bo: boss.snapshot(), f: st.running ? 1 : 0, cp: st.cp, b: st.bridge === 'on' ? 1 : st.bridge === 'timed' ? Math.round((st.bridgeUntil - game.t) * 10) / 10 : 0, c: st.crumble.map(c => (c.s === 'idle' ? 0 : c.s === 'shake' ? 1 : 2)), r: Math.round(st.runT), p: st.plates.map(Number) };
    },
    apply(x) {
      boss.apply(x.bo);
      if (x.cp > st.cp) { flags[x.cp].raisedAt = game.t; }
      st.cp = x.cp; st.runT = x.r; st.running = !!x.f; st.plates = x.p.map(Boolean);
      if (x.b === 1) setBridge('on'); else if (x.b > 0) setBridge('timed', game.t + x.b); else setBridge('off');
      x.c.forEach((v, i) => { const c = st.crumble[i]; const s = v === 0 ? 'idle' : v === 1 ? 'shake' : 'fall'; if (c.s !== s) { c.s = s; c.t = 0; } S.crumbles[i].col.off = s === 'fall'; });
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
        { who: 'Biscotte', text: 'Moi aussi je veux lancer ! J\'ai sauté comme toi, Ainu !' },
        { who: 'Matcha', text: 'Tu vois, Ainu ? Même tout là-haut, tu n\'as pas eu peur.' },
        { who: 'Ainu', text: 'Parce que vous étiez là. Merci de nous avoir guidés. Ouaf !' },
        ...(kid ? [{ who: '', text: `Et tout ça, grâce à ${kid}.` }] : []),
        { who: 'Biscotte', text: `Record : ${Math.floor(tm / 60)} min ${tm % 60} s, avec ${stars} étoile${stars > 1 ? 's' : ''} sur 5 !` },
      ];
    },
    render(dt, t) {
      boss.render(dt, t);
      // plates-formes mobiles (calculées depuis le temps : pareil chez les amis)
      for (const m of movers) {
        const p = S.moverAt(m.def, t);
        m.mesh.position.set(p.x, p.y, p.z);
        if (m.def.look === 'cloud') m.mesh.rotation.y = t * 0.2;
      }
      // nuages fragiles : tremblent, tombent, reviennent
      crumbles.forEach((c, i) => {
        const s = st.crumble[i], d = c.def;
        if (s.s === 'idle') { c.mesh.visible = true; c.mesh.position.set(d.x, d.top + Math.sin(t * 1.5 + i) * 0.04, d.z); c.mesh.material.opacity = Math.min(1, c.mesh.material.opacity + dt * 2); c.mesh.scale.setScalar(1); }
        else if (s.s === 'shake') { c.mesh.position.set(d.x + Math.sin(t * 60) * 0.08, d.top, d.z + Math.cos(t * 55) * 0.08); }
        else { c.mesh.position.y = d.top - s.t * s.t * 6; c.mesh.material.opacity = Math.max(0, 1 - s.t * 1.2); c.mesh.visible = c.mesh.material.opacity > 0.02; if (s.t > S.CRUMBLE_BACK - 0.6) { c.mesh.visible = true; c.mesh.position.y = d.top; c.mesh.material.opacity = (s.t - (S.CRUMBLE_BACK - 0.6)) / 0.6; c.mesh.scale.setScalar(0.6 + c.mesh.material.opacity * 0.4); } }
      });
      // ressorts qui s'écrasent
      for (const s of springs) {
        const since = t - (s.def.col.squashT || -9);
        const k = since < 0.45 ? 1 - Math.sin(since / 0.45 * Math.PI) * 0.35 * (1 - since / 0.45) : 1;
        for (const m of s.cap) m.scale.set(2 - k, k, 2 - k);
      }
      // vent
      for (const d of drafts) {
        d.tube.material.map.offset.y = -t * 0.9; d.inner.material.map.offset.y = -t * 1.4;
        d.tube.rotation.y = t * 0.6; d.inner.rotation.y = -t * 0.9;
        d.ring.scale.setScalar(1 + Math.sin(t * 4) * 0.06);
      }
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
        const k = clamp(st.bridgeK * PLANKS - i, 0, 1);
        m.visible = k > 0.02;
        m.scale.set(1, 1, Math.max(0.01, k));
        m.position.y = B.top - 0.11 - (1 - k) * 0.6;
        m.material = plankMat;
        if (blink) m.visible = m.visible && i % 2 === 0;
      });
      const len = (B.z0 - B.z1) * st.bridgeK;
      for (const r of ropes) { r.m.visible = st.bridgeK > 0.05; r.m.scale.set(1, Math.max(0.01, len), 1); r.m.position.set(B.x + r.sx * (B.w / 2 + 0.2), B.top + 1.2, B.z0 - len / 2); }
      // drapeaux
      flags.forEach((f, i) => {
        const up = i <= st.cp ? 1 : 0;
        f.raise += (up - f.raise) * Math.min(1, dt * 3);
        f.cloth.position.y = 1.0 + f.raise * 2.3;
        f.cloth.material.color.setHex(up ? 0xffffff : 0x9a9a9a);
        const arr = f.cloth.geometry.attributes.position.array;
        for (let k = 0; k < arr.length; k += 3) { const x = f.base[k]; arr[k + 2] = Math.sin(x * 3 - t * 6 + i) * 0.12 * x; }
        f.cloth.geometry.attributes.position.needsUpdate = true;
        const since = t - f.raisedAt;
        f.halo.material.opacity = since < 1.5 ? (1 - since / 1.5) * 0.8 : (i === st.cp ? 0.25 + Math.sin(t * 3) * 0.08 : 0);
        f.halo.scale.setScalar(since < 1.5 ? 1 + since * 2 : 1);
      });
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
