/*
 * Matcha & Ainu — Niveau 5 « La Station des Neiges » : décor et règles du niveau
 * (sol enneigé, sapins, village de chalets, lac gelé, télésiège, Grande Glissade
 * en luge, Cascade Gelée, Fort Moustache et sa bataille de boules de neige,
 * Bernard le sauveteur et Myrtille, l'amie de Mamie). Le moteur commun est dans game.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as W from './world.js';
import * as N from './npcs.js';
import * as RT from './realtex.js';
import { buildCaptain } from './forest.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const wrapA = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

/** Flocon doré (les 100 objets à ramasser du niveau). */
export function flakeGeometry() {
  const s = new THREE.Shape();
  const P = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + Math.PI / 2, b = a + Math.PI / 6;
    P.push([Math.cos(a) * 0.3, Math.sin(a) * 0.3], [Math.cos(a + 0.22) * 0.13, Math.sin(a + 0.22) * 0.13], [Math.cos(b) * 0.17, Math.sin(b) * 0.17], [Math.cos(b + 0.3) * 0.13, Math.sin(b + 0.3) * 0.13]);
  }
  P.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.025, bevelSegments: 1 });
  g.center();
  return g;
}

/** Couleur uniforme (ou calculée) par sommet. */
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
/** Fusionne des géométries (position, normale, couleur et uv quand toutes en ont). */
function merge(list) {
  const geos = list.map(({ geo, x, y, z, rx, ry, rz, sx, sy, sz }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new THREE.Vector3(sx || 1, sy || sx || 1, sz || sx || 1)));
    return g;
  });
  const out = new THREE.BufferGeometry();
  for (const [name, k] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) {
    if (!geos.every(g => g.attributes[name])) continue;
    let n = 0; for (const g of geos) n += g.attributes[name].count;
    const a = new Float32Array(n * k); let o = 0;
    for (const g of geos) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(a, k));
  }
  return out;
}
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); }
  return t;
}
/** Grain de la neige : douces bosses et quelques paillettes. */
function snowTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    const r = rng(17);
    x.fillStyle = '#f2f2f2'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 520; i++) {
      const px = r() * w, py = r() * h, rad = 4 + r() * 16, v = 222 + Math.floor(r() * 33);
      const g = x.createRadialGradient(px, py, 0, px, py, rad);
      g.addColorStop(0, `rgba(${v},${v},${Math.min(255, v + 6)},0.55)`); g.addColorStop(1, `rgba(${v},${v},${v},0)`);
      x.fillStyle = g; x.beginPath(); x.arc(px, py, rad, 0, 7); x.fill();
    }
    for (let i = 0; i < 260; i++) { x.fillStyle = r() < 0.5 ? '#ffffff' : '#dfe6f2'; x.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
  }, 1);
}
/** Rondins de bois (murs des chalets). */
function logTexture() {
  return canvasTex(128, 128, (x, w, h) => {
    const r = rng(5);
    x.fillStyle = '#e8d2b4'; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) {
      const y = j * 16;
      const g = x.createLinearGradient(0, y, 0, y + 16);
      g.addColorStop(0, '#f4e2c8'); g.addColorStop(0.55, '#e0c8a4'); g.addColorStop(1, '#a88a68');
      x.fillStyle = g; x.fillRect(0, y, w, 16);
      for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(120,90,60,0.25)'; x.fillRect(r() * w, y + 4 + r() * 8, 10 + r() * 30, 1); }
    }
  }, 1);
}
/** Glace rayée par les patins. */
function iceTexture() {
  return canvasTex(512, 512, (x, w, h) => {
    const r = rng(41);
    x.fillStyle = '#dfeffa'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { const px = r() * w, py = r() * h, rad = 30 + r() * 90; const g = x.createRadialGradient(px, py, 0, px, py, rad); g.addColorStop(0, 'rgba(160,205,235,0.35)'); g.addColorStop(1, 'rgba(160,205,235,0)'); x.fillStyle = g; x.fillRect(0, 0, w, h); }
    x.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      x.strokeStyle = `rgba(255,255,255,${0.35 + r() * 0.4})`; x.lineWidth = 1 + r() * 1.5;
      const cx = r() * w, cy = r() * h, rad = 40 + r() * 160, a0 = r() * 6.3;
      x.beginPath(); x.arc(cx, cy, rad, a0, a0 + 0.4 + r() * 1.2); x.stroke();
    }
    for (let i = 0; i < 14; i++) {
      x.strokeStyle = 'rgba(120,170,210,0.4)'; x.lineWidth = 1;
      let px = r() * w, py = r() * h; x.beginPath(); x.moveTo(px, py);
      for (let k = 0; k < 5; k++) { px += (r() - 0.5) * 60; py += (r() - 0.5) * 60; x.lineTo(px, py); }
      x.stroke();
    }
  }, 1);
}
function textTex(lines, opts) {
  opts = opts || {};
  return canvasTex(512, 160, (x, w, h) => {
    x.fillStyle = opts.bg || '#7a3a22'; x.beginPath(); x.roundRect(6, 6, w - 12, h - 12, 26); x.fill();
    x.strokeStyle = opts.edge || '#fff2d8'; x.lineWidth = 8; x.stroke();
    if (opts.checker) { for (let i = 0; i < 16; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(16 + i * 30, j === 0 ? 14 : h - 34, 30, 20); } }
    x.fillStyle = opts.color || '#fff6e0'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${opts.size || 64}px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif`;
    x.fillText(lines, w / 2, h / 2 + 4);
  });
}

// ---------------------------------------------------------------------------
// Petits modèles
// ---------------------------------------------------------------------------
/** Sapin enneigé : tronc, trois étages de branches, neige sur chaque étage. */
function pineGeometry(lite) {
  const seg = lite ? 7 : 10, parts = [];
  parts.push({ geo: paint(new THREE.CylinderGeometry(0.16, 0.26, 1.6, 6), 0x5a3a24), y: 0.8 });
  const greens = [0x24503a, 0x2a5c40, 0x316848];
  for (let i = 0; i < 3; i++) {
    const r = 2.1 - i * 0.55, h = 2.5 - i * 0.3, y0 = 1.1 + i * 1.45;
    parts.push({ geo: paint(new THREE.ConeGeometry(r, h, seg), greens[i]), y: y0 + h / 2 });
    const sh = h * 0.5;
    parts.push({ geo: paint(new THREE.ConeGeometry(r * 0.5 * 1.08, sh, seg), 0xf2f6fc), y: y0 + h + 0.03 - sh / 2 });
    // neige au bord des branches (une couronne irrégulière)
    const rim = new THREE.CylinderGeometry(r * 0.98, r * 1.02, 0.12, seg, 1, true);
    parts.push({ geo: paint(rim, 0xe8eef8), y: y0 + 0.06 });
  }
  return merge(parts);
}
/** Luge en bois rouge. */
function buildSled() {
  const g = new THREE.Group();
  const wood = M.mat(0xd8402e, { roughness: 0.6 }), dark = M.mat(0x3a2a24, { roughness: 0.5, metalness: 0.4 });
  for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.06, 0.3), wood); s.position.set(0, 0.28, -0.6 + i * 0.36); g.add(s); }
  for (const sx of [-1, 1]) {
    const run = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.7), dark); run.position.set(sx * 0.36, 0.04, 0); g.add(run);
    const curl = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 6, 10, Math.PI), dark); curl.rotation.y = Math.PI / 2; curl.position.set(sx * 0.36, 0.21, 0.85); g.add(curl);
    for (const z of [-0.5, 0.4]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.05), wood); leg.position.set(sx * 0.36, 0.16, z); g.add(leg); }
  }
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.02, 4, 12, Math.PI), M.mat(0xe8d8a0)); rope.rotation.x = -Math.PI / 2 + 0.4; rope.position.set(0, 0.3, 0.92); g.add(rope);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/** Bonnet à pompon. */
function buildBonnet(color) {
  const g = new THREE.Group();
  const knit = M.mat(color, { roughness: 0.95 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2), knit); cap.scale.set(1, 1.15, 1); g.add(cap);
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.07, 8, 20), M.mat(0xffffff, { roughness: 1 })); band.rotation.x = Math.PI / 2; band.position.y = 0.03; g.add(band);
  const pom = new THREE.Mesh(new THREE.IcosahedronGeometry(0.12, 1), M.mat(0xffffff, { roughness: 1 })); pom.position.y = 0.38; g.add(pom);
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}
/** Petit accessoire posé devant le poitrail d'un personnage (d'après sa forme). */
function chestOf(m) {
  m.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(m);
  return { y: b.min.y + (b.max.y - b.min.y) * 0.48, z: b.max.z * 0.62, h: b.max.y - b.min.y };
}
/** Bernard, le Saint-Bernard sauveteur (avec son tonnelet). */
function buildBernard() {
  let m;
  if (W.LOOK.real && N.hasNpc('shiba')) { m = N.buildNpc('shiba', { tint: 0xfff4ec, scale: 1.55 }); const u = m.userData; u.mhead = u.head; u.mtail = u.tail; }
  else m = M.buildPug({ fur: 0xf6eee2, mask: 0x9a4a1e, belly: 0xffffff, collar: 0xd83a3a, scale: 1.95 });
  const c = chestOf(m);
  const keg = new THREE.Group();
  const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.3, 14), M.mat(0xb07840, { roughness: 0.8 })); wood.rotation.z = Math.PI / 2; keg.add(wood);
  for (const x of [-0.1, 0.1]) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.135, 0.018, 6, 16), M.mat(0x4a4a50, { metalness: 0.6, roughness: 0.4 })); band.rotation.y = Math.PI / 2; band.position.x = x; keg.add(band); }
  keg.position.set(0, c.y - c.h * 0.06, c.z + 0.05);
  m.add(keg);
  // brassard de sauveteur (croix rouge)
  const cross = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26), new THREE.MeshBasicMaterial({ map: canvasTex(64, 64, (x) => { x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#e02a2a'; x.fillRect(24, 8, 16, 48); x.fillRect(8, 24, 48, 16); }) }));
  cross.position.set(0.02, c.y + c.h * 0.05, c.z + 0.2); m.add(cross);
  m.userData.height = m.userData.height || c.h;
  return m;
}
/** Myrtille, la vieille amie de Mamie (écharpe tricotée). */
function buildMyrtille() {
  let m;
  if (W.LOOK.real && N.hasNpc('bouledogue')) { m = N.buildNpc('bouledogue', { tint: 0xf4e4ec }); const u = m.userData; u.mhead = u.head; u.mtail = u.tail; }
  else m = M.buildYorkie({ bow: 0xd04a8a, steel: 0x9a8a9a, tan: 0xf2d6b8, scale: 1.7 });
  const c = chestOf(m);
  const scarf = new THREE.Mesh(new THREE.TorusGeometry(c.h * 0.17, c.h * 0.05, 8, 20), M.mat(0x8a4ac8, { roughness: 1 }));
  scarf.rotation.x = Math.PI / 2 - 0.4; scarf.position.set(0, c.y + c.h * 0.18, c.z * 0.55); m.add(scarf);
  const tail = new THREE.Mesh(new THREE.BoxGeometry(c.h * 0.08, c.h * 0.28, c.h * 0.03), M.mat(0x8a4ac8, { roughness: 1 }));
  tail.position.set(c.h * 0.08, c.y, c.z * 0.55 + c.h * 0.1); tail.rotation.z = 0.2; m.add(tail);
  m.userData.height = m.userData.height || c.h;
  return m;
}
function glowSprite(color, size, opacity) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color, transparent: true, opacity: opacity === undefined ? 0.7 : opacity, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.set(size, size, 1); s.userData.noOutline = true;
  return s;
}
function flagTexture() {
  return canvasTex(128, 64, (x) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#3a8ae0'; x.fillRect(0, 0, 128, 10); x.fillRect(0, 54, 128, 10);
    x.fillStyle = '#3a8ae0';
    // un flocon
    x.strokeStyle = '#3a8ae0'; x.lineWidth = 5; x.lineCap = 'round';
    for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; x.beginPath(); x.moveTo(64 - Math.cos(a) * 18, 32 - Math.sin(a) * 18); x.lineTo(64 + Math.cos(a) * 18, 32 + Math.sin(a) * 18); x.stroke(); }
  });
}

// ===========================================================================
export function buildSnow(game) {
  const sc = game.scene, S = L, lite = game.lite;
  const moving = [], chars = [];
  const save = () => game.save;
  const snow = () => { const s = save(); if (!s.snow) s.snow = {}; const k = s.snow; if (!k.bonnets) k.bonnets = []; if (!k.flags) k.flags = []; if (k.cp === undefined) k.cp = 0; return k; };
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.9 }, o || {}));
  const real = W.LOOK.real;
  const snowTex = snowTexture();
  const snowNormal = real ? RT.normalFor(snowTex, 1.2) : null;

  // --- le sol enneigé ------------------------------------------------------------------
  {
    const size = S.WORLD, seg = lite ? 150 : 240;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      pos.setY(i, S.heightAt(x, z) - (S.iceAt(x, z) ? 0.4 : 0));
    }
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3), c = new THREE.Color();
    const SNOW = new THREE.Color(0.93, 0.955, 0.99), SHADE = new THREE.Color(0.76, 0.84, 0.96), ROCK = new THREE.Color(0.42, 0.42, 0.47), ROCK2 = new THREE.Color(0.55, 0.53, 0.55);
    const PATH = new THREE.Color(0.84, 0.86, 0.9), RUNC = new THREE.Color(0.82, 0.9, 1.0), DEEP = new THREE.Color(0.3, 0.44, 0.58);
    const pathD = (x, z) => {
      let best = 1e9;
      for (const [[ax, az], [bx, bz]] of S.SNOW_PATHS) { const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz, t = clamp(((x - ax) * dx + (z - az) * dz) / l, 0, 1); best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz)); }
      return best;
    };
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i), ny = nrm.getY(i);
      const n = Math.sin(x * 0.31 + Math.sin(z * 0.17) * 2) * 0.5 + Math.sin(z * 0.23 + Math.cos(x * 0.13) * 2) * 0.5;
      c.copy(SNOW).lerp(SHADE, smooth(0.985, 0.88, ny) * 0.75 + (n * 0.5 + 0.5) * 0.08);
      c.lerp(PATH, (1 - smooth(1.2, 2.6, pathD(x, z))) * 0.7);
      const ri = S.runInfo(x, z);
      c.lerp(RUNC, (1 - smooth(1.5, S.RUN_W, ri.d)) * 0.6);
      c.lerp(n > 0 ? ROCK : ROCK2, smooth(0.66, 0.42, ny) * smooth(9, 18, pos.getY(i)) * (0.65 + 0.35 * n));
      if (S.iceAt(x, z)) c.copy(DEEP);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const tex = snowTex.clone(); tex.needsUpdate = true; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(size / 5, size / 5);
    let nm = null;
    if (snowNormal) { nm = snowNormal.clone(); nm.needsUpdate = true; nm.wrapS = nm.wrapT = THREE.RepeatWrapping; nm.repeat.set(size / 5, size / 5); }
    const m = new THREE.Mesh(geo, std({ vertexColors: true, map: tex, normalMap: nm, roughness: 0.82 }));
    m.name = 'terrain'; m.receiveShadow = true;
    sc.add(m);
  }

  // --- la glace : le lac et la mare de la cascade ----------------------------------------
  const iceMat = std({ map: iceTexture(), color: 0xd4ecfa, roughness: 0.12, metalness: 0.05, transparent: true, opacity: 0.94 });
  {
    const LK = S.LAKE;
    const g = new THREE.RingGeometry(LK.islet - 0.2, LK.r + 0.6, 72, 2); g.rotateX(-Math.PI / 2);
    const uv = g.attributes.uv, p = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) / 18 + 0.5, p.getZ(i) / 18 + 0.5);
    const lake = new THREE.Mesh(g, iceMat); lake.position.set(LK.x, LK.y + 0.015, LK.z); lake.receiveShadow = true;
    sc.add(lake);
    const FP = S.FALLS_POOL;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(FP.r + 0.3, 32).rotateX(-Math.PI / 2), iceMat);
    pool.position.set(FP.x, S.heightAt(FP.x, FP.z) + 0.02, FP.z); pool.receiveShadow = true;
    sc.add(pool);
  }

  // --- sapins ------------------------------------------------------------------------------
  {
    const geo = pineGeometry(lite);
    const mat = std({ vertexColors: true, roughness: 0.92 });
    const r = rng(9), m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();
    const deco = [];
    // sapins des montagnes tout autour (décor)
    let guard = 0;
    const want = lite ? 70 : 170;
    while (deco.length < want && guard++ < 6000) {
      const x = (r() - 0.5) * 236, z = (r() - 0.5) * 236;
      const e4 = Math.pow(x ** 4 + z ** 4, 0.25);
      if (e4 < 99 || e4 > 117) continue;
      const h = S.heightAt(x, z);
      if (Math.abs(S.heightAt(x + 1.5, z) - h) + Math.abs(S.heightAt(x, z + 1.5) - h) > 3.2) continue;
      deco.push({ x, z, y: h, s: 0.9 + r() * 0.8, k: 1 });
    }
    const all = S.trees.map(t => ({ x: t.x, z: t.z, y: t.y, s: t.s, k: t.h / 7 / t.s })).concat(deco);
    const inst = new THREE.InstancedMesh(geo, mat, all.length);
    const c = new THREE.Color();
    all.forEach((t, i) => {
      m4.compose(v.set(t.x, t.y - 0.25, t.z), q.setFromEuler(e.set(0, r() * 6.28, (r() - 0.5) * 0.06)), s.set(t.s, t.s * (t.k || 1) * (0.9 + r() * 0.25), t.s));
      inst.setMatrixAt(i, m4);
      inst.setColorAt(i, c.setScalar(0.9 + r() * 0.15));
    });
    inst.castShadow = true; inst.receiveShadow = true;
    if (lite) inst.userData.noOutline = true;
    sc.add(inst);
  }

  // --- le village : chalets, grand sapin, lampadaires ---------------------------------------
  const winMat = new THREE.MeshStandardMaterial({ color: 0xffe0a0, emissive: 0xffa040, emissiveIntensity: 0.75, roughness: 0.4 });
  const chimneys = [];
  {
    const walls = [], roofs = [], snowy = [], wins = [], frames = [];
    const logs = logTexture();
    const roofSlab = (c, ridgeX, span, len, h) => {
      // deux pans de toit (couleur), recouverts de neige
      const pitch = 0.62, half = span / 2, rise = Math.tan(pitch) * half, slope = half / Math.cos(pitch) + 0.55;
      for (const sd of [-1, 1]) {
        const off = sd * (half / 2 + 0.1);
        const where = ridgeX ? { x: c.x, z: c.z + off, rx: sd * pitch } : { x: c.x + off, z: c.z, rz: -sd * pitch };
        const panel = (th, ext, shrink, color) => (ridgeX ? new THREE.BoxGeometry(len + ext, th, slope - shrink) : new THREE.BoxGeometry(slope - shrink, th, len + ext));
        roofs.push(Object.assign({ geo: paint(panel(0.24, 0.9, 0), c.roof), y: c.y + h + rise / 2 + 0.05 }, where));
        snowy.push(Object.assign({ geo: paint(panel(0.2, 0.7, 0.25), 0xf4f8ff), y: c.y + h + rise / 2 + 0.24 }, where));
      }
      // pignons (triangles)
      const sh = new THREE.Shape(); sh.moveTo(-half, 0); sh.lineTo(half, 0); sh.lineTo(0, rise); sh.closePath();
      for (const e of [-1, 1]) {
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false });
        if (ridgeX) walls.push({ geo: paint(g, c.col), x: c.x + e * (len / 2) - (e > 0 ? 0.2 : 0), y: c.y + h, z: c.z, ry: Math.PI / 2 });
        else walls.push({ geo: paint(g, c.col), x: c.x, y: c.y + h, z: c.z + e * (len / 2) - (e > 0 ? 0.2 : 0) });
      }
      return rise;
    };
    for (const c of S.CHALETS) {
      walls.push({ geo: paint(new THREE.BoxGeometry(c.w, c.h, c.d), c.col), x: c.x, y: c.y + c.h / 2, z: c.z });
      const ridgeX = c.door !== 0;   // le pignon regarde la place
      const rise = ridgeX ? roofSlab(c, true, c.d, c.w, c.h) : roofSlab(c, false, c.w, c.d, c.h);
      // porte et fenêtres (côté place)
      const fx = c.door ? c.door : 0, fz = c.door ? 0 : 1;
      const fd = (c.door ? c.w : c.d) / 2 + 0.03;
      const along = (k) => (c.door ? { x: c.x + fx * fd, z: c.z + k } : { x: c.x + k, z: c.z + fz * fd });
      const doorP = along(0);
      frames.push({ geo: paint(new THREE.BoxGeometry(c.door ? 0.08 : 1.1, 1.9, c.door ? 1.1 : 0.08), 0x5a3420), x: doorP.x, y: c.y + 0.95, z: doorP.z });
      for (const k of [-2.0, 2.0]) {
        const p = along(k);
        wins.push({ geo: new THREE.BoxGeometry(c.door ? 0.08 : 0.9, 0.8, c.door ? 0.9 : 0.08), x: p.x, y: c.y + 1.9, z: p.z });
        frames.push({ geo: paint(new THREE.BoxGeometry(c.door ? 0.1 : 1.1, 1.0, c.door ? 1.1 : 0.1), 0xfff4e4), x: p.x - fx * 0.01, y: c.y + 1.9, z: p.z - fz * 0.01 });
      }
      // fenêtre ronde dans le pignon
      const gp = along(0);
      wins.push({ geo: new THREE.CylinderGeometry(0.35, 0.35, 0.08, 14), x: gp.x, y: c.y + c.h + rise * 0.4, z: gp.z, rx: c.door ? 0 : Math.PI / 2, rz: c.door ? Math.PI / 2 : 0 });
      // cheminée
      const chx = c.x + (c.door ? -fx * c.w * 0.22 : c.w * 0.25), chz = c.z + (c.door ? c.d * 0.22 : -c.d * 0.2);
      frames.push({ geo: paint(new THREE.BoxGeometry(0.6, 1.6, 0.6), 0x8a6a5a), x: chx, y: c.y + c.h + rise * 0.55 + 0.4, z: chz });
      snowy.push({ geo: paint(new THREE.BoxGeometry(0.72, 0.16, 0.72), 0xf4f8ff), x: chx, y: c.y + c.h + rise * 0.55 + 1.25, z: chz });
      chimneys.push({ x: chx, y: c.y + c.h + rise * 0.55 + 1.4, z: chz });
      // neige au pied des murs
      snowy.push({ geo: paint(new THREE.CylinderGeometry(0.5, 0.7, 0.4, 8), 0xf0f4fc), x: c.x + (c.door ? -fx * (c.w / 2) : c.w / 2 - 0.3), y: c.y + 0.1, z: c.z + (c.door ? c.d / 2 - 0.4 : -fz * c.d / 2), sx: 1.4 });
    }
    const wallM = new THREE.Mesh(merge(walls), std({ vertexColors: true, map: logs, roughness: 0.85 }));
    wallM.castShadow = wallM.receiveShadow = true;
    // (les pignons n'ont pas d'uv cohérents avec les rondins : peu importe, ils sont lisses)
    const roofM = new THREE.Mesh(merge(roofs), std({ vertexColors: true, roughness: 0.7 }));
    const snowM = new THREE.Mesh(merge(snowy), std({ vertexColors: true, roughness: 0.85, map: snowTex }));
    const frameM = new THREE.Mesh(merge(frames), std({ vertexColors: true, roughness: 0.8 }));
    const winM = new THREE.Mesh(merge(wins), winMat);
    for (const m of [roofM, snowM, frameM]) { m.castShadow = true; m.receiveShadow = true; }
    sc.add(wallM, roofM, snowM, frameM, winM);
    // enseigne du chalet-chocolat de Myrtille
    const ch = S.CHALETS.find(c => c.choco);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.0), new THREE.MeshStandardMaterial({ map: textTex('Chocolat chaud', { bg: '#6a3a22', size: 58 }), roughness: 0.7 }));
    sign.position.set(ch.x - ch.w / 2 - 0.06, ch.y + ch.h + 0.2, ch.z); sign.rotation.y = -Math.PI / 2;
    sc.add(sign);
    // comptoir et tasses
    const counter = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.0, 2.4), M.mat(0x8a5a3a, { roughness: 0.8 }));
    counter.position.set(ch.x - ch.w / 2 - 0.8, ch.y + 0.5, ch.z + 2.1); counter.castShadow = true; sc.add(counter);
    for (let i = 0; i < 3; i++) { const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.2, 10), M.mat([0xe84a4a, 0x4a8ae8, 0xf0c030][i])); mug.position.set(ch.x - ch.w / 2 - 0.8, ch.y + 1.1, ch.z + 1.4 + i * 0.6); sc.add(mug); chimneys.push({ x: mug.position.x, y: mug.position.y + 0.15, z: mug.position.z, mug: true }); }
  }
  // grand sapin décoré au milieu de la place
  const treeLights = [];
  {
    const T = S.BIG_TREE, y0 = S.VILLAGE_Y, parts = [], balls = [];
    parts.push({ geo: paint(new THREE.CylinderGeometry(0.3, 0.45, 1.6, 8), 0x5a3a24), y: y0 + 0.8 });
    for (let i = 0; i < 5; i++) {
      const r = 3.3 - i * 0.6, h = 2.6 - i * 0.2, yb = y0 + 1.2 + i * 1.35;
      parts.push({ geo: paint(new THREE.ConeGeometry(r, h, 12), [0x245a3a, 0x2a6442, 0x2e6c46, 0x34744c, 0x387c50][i]), y: yb + h / 2 });
      parts.push({ geo: paint(new THREE.ConeGeometry(r * 0.42, h * 0.42, 12), 0xf2f6fc), y: yb + h - h * 0.21 + 0.03 });
      for (let k = 0; k < 7 - i; k++) {
        const a = k / (7 - i) * Math.PI * 2 + i, rr = r * 0.82;
        balls.push({ geo: paint(new THREE.SphereGeometry(0.17, 8, 6), [0xff3a4a, 0xffd23a, 0x4ab0ff, 0xff7ad8][(k + i) % 4]), x: T.x + Math.cos(a) * rr, y: yb + 0.35, z: T.z + Math.sin(a) * rr });
      }
    }
    const tm = new THREE.Mesh(merge(parts), std({ vertexColors: true }));
    tm.position.set(T.x, 0, T.z); tm.castShadow = true; sc.add(tm);
    const bm = new THREE.Mesh(merge(balls), new THREE.MeshBasicMaterial({ vertexColors: true }));
    bm.userData.noOutline = true; sc.add(bm); treeLights.push(bm);
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.45, 0), M.mat(0xffd23a, { metalness: 0.6, roughness: 0.3, emissive: 0xffa000, emissiveIntensity: 0.9 }));
    star.position.set(T.x, y0 + 1.2 + 5 * 1.35 + 0.6, T.z); sc.add(star);
    const sg = glowSprite(0xffe080, 3.2, 0.55); sg.position.copy(star.position); sc.add(sg);
    treeLights.push(star);
  }
  // lampadaires
  {
    const posts = [], lan = [];
    for (const l of S.LAMPS) {
      posts.push({ geo: paint(new THREE.CylinderGeometry(0.07, 0.1, 3, 6), 0x2a2a32), x: l.x, y: l.y + 1.5, z: l.z });
      posts.push({ geo: paint(new THREE.ConeGeometry(0.32, 0.3, 4), 0x2a2a32), x: l.x, y: l.y + 3.45, z: l.z, ry: Math.PI / 4 });
      posts.push({ geo: paint(new THREE.ConeGeometry(0.3, 0.14, 4), 0xf4f8ff), x: l.x, y: l.y + 3.62, z: l.z, ry: Math.PI / 4 });
      lan.push({ geo: new THREE.BoxGeometry(0.3, 0.38, 0.3), x: l.x, y: l.y + 3.1, z: l.z });
      const s = glowSprite(0xffd890, 1.6, 0.45); s.position.set(l.x, l.y + 3.1, l.z); sc.add(s);
    }
    const pm = new THREE.Mesh(merge(posts), std({ vertexColors: true, roughness: 0.5, metalness: 0.4 })); pm.castShadow = true; sc.add(pm);
    sc.add(new THREE.Mesh(merge(lan), winMat));
  }

  // --- télésiège ----------------------------------------------------------------------------
  const LIFT = S.LIFT;
  const liftDir = { x: LIFT.top.x - LIFT.base.x, z: LIFT.top.z - LIFT.base.z };
  { const l = Math.hypot(liftDir.x, liftDir.z); liftDir.x /= l; liftDir.z /= l; }
  const side = { x: liftDir.z, z: -liftDir.x };     // vers la droite en montant
  const LANE = 1.25;                                 // écart entre la montée et la descente
  const liftYaw = Math.atan2(liftDir.x, liftDir.z);
  {
    const metal = std({ vertexColors: true, roughness: 0.5, metalness: 0.5 });
    const parts = [];
    for (const p of S.PYLONS) {
      parts.push({ geo: paint(new THREE.CylinderGeometry(0.22, 0.32, p.top - p.y + 0.3, 8), 0x5a6678), x: p.x, y: p.y + (p.top - p.y + 0.3) / 2, z: p.z });
      parts.push({ geo: paint(new THREE.BoxGeometry(LANE * 2 + 0.6, 0.22, 0.3), 0xe8b020), x: p.x, y: p.top + 0.25, z: p.z, ry: liftYaw + Math.PI / 2 });
      for (const sd of [-1, 1]) parts.push({ geo: paint(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 10), 0x2a2a30), x: p.x + side.x * LANE * sd, y: p.top + 0.08, z: p.z + side.z * LANE * sd, rx: Math.PI / 2, ry: liftYaw });
    }
    // gares : poteaux et grande roue horizontale
    for (const st of [LIFT.base, LIFT.top]) {
      const top = st.y + 4.6;
      for (const sd of [-1, 1]) parts.push({ geo: paint(new THREE.CylinderGeometry(0.2, 0.28, 4.8, 8), 0x5a6678), x: st.x + side.x * sd * 0.8 - liftDir.x * 0.6, y: st.y + 2.4, z: st.z + side.z * sd * 0.8 - liftDir.z * 0.6 });
      parts.push({ geo: paint(new THREE.TorusGeometry(LANE, 0.12, 6, 24), 0xe8b020), x: st.x, y: top, z: st.z, rx: Math.PI / 2 });
      parts.push({ geo: paint(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 12), 0x3a3a44), x: st.x, y: top + 0.1, z: st.z });
      parts.push({ geo: paint(new THREE.BoxGeometry(2.4, 0.18, 2.4), 0xd84a3a), x: st.x, y: top + 0.55, z: st.z, ry: liftYaw });
      parts.push({ geo: paint(new THREE.BoxGeometry(2.5, 0.12, 2.5), 0xf4f8ff), x: st.x, y: top + 0.7, z: st.z, ry: liftYaw });
    }
    const pm = new THREE.Mesh(merge(parts), metal); pm.castShadow = true; pm.receiveShadow = true; sc.add(pm);
    // câbles
    const cab = [];
    for (const sd of [-1, 1]) for (let i = 0; i + 1 < S.LIFT_PTS.length; i++) {
      const a = S.LIFT_PTS[i], b = S.LIFT_PTS[i + 1];
      const ax = a.x + side.x * LANE * sd, az = a.z + side.z * LANE * sd, bx = b.x + side.x * LANE * sd, bz = b.z + side.z * LANE * sd;
      const len = Math.hypot(bx - ax, b.y - a.y, bz - az);
      const g = new THREE.CylinderGeometry(0.035, 0.035, len, 4, 1, true);
      g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(bx - ax, b.y - a.y, bz - az).normalize()));
      g.translate((ax + bx) / 2, (a.y + b.y) / 2, (az + bz) / 2);
      cab.push({ geo: g });
    }
    const cm = new THREE.Mesh(merge(cab), M.mat(0x2a2a30, { roughness: 0.5, metalness: 0.6 })); cm.userData.noOutline = true; sc.add(cm);
    // gare du bas (cabane) et plate-forme du haut
    const STN = S.STATION;
    const stParts = [
      { geo: paint(new THREE.BoxGeometry(STN.w, STN.h, STN.d), 0x9a6a44), x: STN.x, y: STN.y + STN.h / 2, z: STN.z },
      { geo: paint(new THREE.BoxGeometry(STN.w + 0.5, 0.25, STN.d + 0.5), 0x6a4a34), x: STN.x, y: STN.y + STN.h + 0.05, z: STN.z },
      { geo: paint(new THREE.BoxGeometry(STN.w + 0.3, 0.22, STN.d + 0.3), 0xf4f8ff), x: STN.x, y: STN.y + STN.h + 0.25, z: STN.z },
      { geo: paint(new THREE.BoxGeometry(1.2, 0.9, 0.08), 0xffe0a0), x: STN.x + 0.6, y: STN.y + 2, z: STN.z + STN.d / 2 + 0.03 },
      { geo: paint(new THREE.BoxGeometry(0.9, 1.9, 0.08), 0x4a2a1a), x: STN.x - 1, y: STN.y + 0.95, z: STN.z + STN.d / 2 + 0.03 },
    ];
    const WP = S.WOODPILE;
    for (let i = 0; i < 9; i++) { const row = Math.floor(i / 3), k = i % 3; stParts.push({ geo: paint(new THREE.CylinderGeometry(0.28, 0.28, WP.d, 8), 0xa07048), x: WP.x - 0.56 + k * 0.56, y: WP.y + 0.28 + row * 0.5, z: WP.z, rx: Math.PI / 2 }); }
    stParts.push({ geo: paint(new THREE.BoxGeometry(WP.w + 0.1, 0.16, WP.d + 0.1), 0xf4f8ff), x: WP.x, y: WP.y + WP.h - 0.02, z: WP.z });
    const D = S.TOP_DECK;
    stParts.push({ geo: paint(new THREE.BoxGeometry(4, 0.3, 4), 0x9a6a44), x: D.x, y: S.heightAt(D.x, D.z) + 0.05, z: D.z, ry: liftYaw });
    // poste de secours de Bernard
    const H = S.HUT;
    stParts.push({ geo: paint(new THREE.BoxGeometry(H.w, H.h + 1.5, H.d), 0xc84a3a), x: H.x, y: H.y + (H.h - 1.5) / 2, z: H.z });
    stParts.push({ geo: paint(new THREE.BoxGeometry(H.w + 0.6, 0.3, H.d + 0.6), 0x6a3a2a), x: H.x, y: H.y + H.h + 0.1, z: H.z });
    stParts.push({ geo: paint(new THREE.BoxGeometry(H.w + 0.4, 0.3, H.d + 0.4), 0xf4f8ff), x: H.x, y: H.y + H.h + 0.35, z: H.z });
    stParts.push({ geo: paint(new THREE.BoxGeometry(1, 1.9, 0.08), 0x4a2a1a), x: H.x - 1, y: H.y + 0.95, z: H.z + H.d / 2 + 0.03 });
    const stM = new THREE.Mesh(merge(stParts), std({ vertexColors: true, roughness: 0.8 })); stM.castShadow = true; stM.receiveShadow = true; sc.add(stM);
    const cross = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: canvasTex(64, 64, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.fillStyle = '#e02a2a'; x.fillRect(25, 10, 14, 44); x.fillRect(10, 25, 44, 14); }), transparent: true, roughness: 0.6 }));
    cross.position.set(H.x + 0.9, H.y + H.h - 0.9, H.z + H.d / 2 + 0.05); sc.add(cross);
  }
  // sièges (tous dans un seul maillage instancié) : ceux qui tournent, puis ceux des joueurs
  const CHAIRS = lite ? 12 : 18, RIDERS = 6;
  const chairGeo = merge([
    { geo: paint(new THREE.CylinderGeometry(0.035, 0.035, S.SEAT_DROP, 5), 0x3a3a44), y: -S.SEAT_DROP / 2 },
    { geo: paint(new THREE.BoxGeometry(1.3, 0.1, 0.6), 0xd8402e), y: -S.SEAT_DROP, z: 0.1 },
    { geo: paint(new THREE.BoxGeometry(1.3, 0.6, 0.08), 0xd8402e), y: -S.SEAT_DROP + 0.32, z: -0.18 },
    { geo: paint(new THREE.BoxGeometry(1.4, 0.06, 0.06), 0x3a3a44), y: -S.SEAT_DROP + 0.65, z: 0.42 },
    { geo: paint(new THREE.BoxGeometry(0.06, 0.6, 0.06), 0x3a3a44), x: 0.68, y: -S.SEAT_DROP + 0.35, z: 0.42 },
  ]);
  const chairs = new THREE.InstancedMesh(chairGeo, std({ vertexColors: true, roughness: 0.6 }), CHAIRS + RIDERS);
  chairs.castShadow = true; chairs.frustumCulled = false;
  sc.add(chairs); moving.push(chairs);

  // --- la Grande Glissade : portes, départ, arrivée, luges ------------------------------------
  {
    const parts = [];
    const RUN = S.RUN;
    for (let i = 1; i < RUN.length - 1; i++) {
      const [x, z] = RUN[i], [px, pz] = RUN[i - 1], [nx, nz] = RUN[i + 1];
      const dx = nx - px, dz = nz - pz, l = Math.hypot(dx, dz), sx = dz / l, sz = -dx / l;
      const col = i % 2 ? 0xe83a3a : 0x3a7ae8;
      for (const sd of [-1, 1]) {
        const ox = x + sx * sd * (S.RUN_W + 1), oz = z + sz * sd * (S.RUN_W + 1), y = S.heightAt(ox, oz);
        parts.push({ geo: paint(new THREE.CylinderGeometry(0.06, 0.06, 2.2, 6), 0xf4f4f4), x: ox, y: y + 1.1, z: oz });
        parts.push({ geo: paint(new THREE.BoxGeometry(0.9, 0.6, 0.04), col), x: ox - sx * sd * 0.45, y: y + 1.85, z: oz - sz * sd * 0.45, ry: Math.atan2(sx, sz) + Math.PI / 2 });
      }
    }
    // barrières de neige au bord de la piste (petits fanions orange)
    const pm = new THREE.Mesh(merge(parts), std({ vertexColors: true, roughness: 0.6 })); pm.castShadow = true; sc.add(pm);
    const arch = (x, z, yaw, label, opts) => {
      const g = new THREE.Group(), y = S.heightAt(x, z);
      for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 4, 8), M.mat(0x3a7ae8, { roughness: 0.5 })); p.position.set(sd * (S.RUN_W + 0.5), 2, 0); p.castShadow = true; g.add(p); }
      const ban = new THREE.Mesh(new THREE.PlaneGeometry(S.RUN_W * 2 + 1.4, 1.3), new THREE.MeshStandardMaterial({ map: textTex(label, opts), side: THREE.DoubleSide, roughness: 0.6 }));
      ban.position.y = 3.6; g.add(ban);
      g.position.set(x, y, z); g.rotation.y = yaw + Math.PI;   // (le texte se lit en arrivant d'en haut)
      sc.add(g);
      return g;
    };
    const d0 = S.runInfo(S.SLED_START.x, S.SLED_START.z).dir;
    arch(S.RUN[0][0] + d0[0] * 3, S.RUN[0][1] + d0[1] * 3, Math.atan2(d0[0], d0[1]), 'DÉPART', { bg: '#2a6ad0' });
    const dl = S.runInfo(S.FINISH.x, S.FINISH.z).dir;
    arch(S.FINISH.x, S.FINISH.z, Math.atan2(dl[0], dl[1]), 'ARRIVÉE', { bg: '#d03a3a', checker: true, size: 56 });
    // les luges du sommet, appuyées contre un râtelier
    const R = S.SLED_RACK;
    const rack = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 0.12), M.mat(0x7a5030)); rack.position.set(R.x, R.y + 1.1, R.z); sc.add(rack);
    for (const sd of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.2, 6), M.mat(0x7a5030)); p.position.set(R.x + sd * 1.2, R.y + 0.6, R.z); sc.add(p); }
    for (let i = 0; i < 3; i++) { const s = buildSled(); s.position.set(R.x - 0.8 + i * 0.8, R.y + 0.05, R.z + 0.55); s.rotation.set(-1.15, 0, 0); s.scale.setScalar(0.85); sc.add(s); }
  }
  // une luge par joueur en train de descendre
  const sledPool = [];
  for (let i = 0; i < 6; i++) { const s = buildSled(); s.visible = false; sc.add(s); moving.push(s); sledPool.push(s); }
  const sledFor = (i) => sledPool[Math.min(i, sledPool.length - 1)];

  // --- la Cascade Gelée ------------------------------------------------------------------------
  {
    const ice = new THREE.MeshStandardMaterial({ color: 0xb8e2f8, roughness: 0.18, metalness: 0.05, emissive: 0x2a6aa0, emissiveIntensity: 0.18, flatShading: true });
    const parts = [], caps = [];
    for (const s of S.ICE_STEPS) {
      const g0 = S.heightAt(s.x, s.z) - 0.6, h = s.top - g0;
      parts.push({ geo: new THREE.CylinderGeometry(s.r, s.r * 1.08, h, 6), x: s.x, y: g0 + h / 2, z: s.z, ry: s.x * 0.7 });
      caps.push({ geo: paint(new THREE.CylinderGeometry(s.r * 0.92, s.r * 0.98, 0.16, 6), 0xf4f8ff), x: s.x, y: s.top + 0.04, z: s.z, ry: s.x * 0.7 });
    }
    const IF = S.ICEFALL, Lg = S.LEDGE;
    // le rideau de glace : une cascade figée, avec ses stalactites
    const fall = new THREE.PlaneGeometry(IF.w, Lg.top - 1.5, 14, 14);
    const fp = fall.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const u = fp.getX(i), v = fp.getY(i);
      fp.setZ(i, 0.35 + Math.sin(u * 2.3) * 0.25 + Math.sin(v * 1.3 + u) * 0.15 + (v < -(Lg.top - 1.5) / 2 + 1.5 ? 0.6 : 0));
    }
    fall.computeVertexNormals();
    const fallM = new THREE.Mesh(fall, new THREE.MeshStandardMaterial({ color: 0xd8f2ff, roughness: 0.08, metalness: 0.1, emissive: 0x4a9ad0, emissiveIntensity: 0.22, transparent: true, opacity: 0.88, side: THREE.DoubleSide }));
    fallM.position.set(Lg.x1 + 0.1, S.VILLAGE_Y + (Lg.top - 1.5) / 2 + 0.4, IF.z); fallM.rotation.y = Math.PI / 2;
    sc.add(fallM);
    const icicles = [];
    const r = rng(31);
    for (let z = Lg.z0 + 0.6; z < Lg.z1 - 0.4; z += 0.7) {
      const len = 0.5 + r() * 1.4;
      icicles.push({ geo: new THREE.ConeGeometry(0.12 + r() * 0.08, len, 5), x: Lg.x1 + 0.35, y: Lg.top - len / 2 - 0.05, z, rx: Math.PI });
    }
    const im = new THREE.Mesh(merge(parts.concat(icicles)), ice); im.castShadow = true; im.receiveShadow = true; sc.add(im);
    const cm = new THREE.Mesh(merge(caps), std({ vertexColors: true })); cm.receiveShadow = true; sc.add(cm);
    // rochers enneigés sur la corniche
    const rocks = [];
    for (let i = 0; i < 6; i++) { const x = Lg.x0 + 6 + r() * 10, z = Lg.z0 + 3 + r() * 24; if (Math.hypot(x + 86, z + 30) < 3) continue; rocks.push({ geo: paint(new THREE.IcosahedronGeometry(0.8 + r() * 0.8, 0), 0x8a8a94), x, y: Lg.top + 0.2, z, sy: 0.6 }); }
    if (rocks.length) { const rm = new THREE.Mesh(merge(rocks), std({ vertexColors: true, flatShading: true })); rm.castShadow = true; sc.add(rm); }
  }

  // --- le Fort Moustache ----------------------------------------------------------------------
  const FORT = S.FORT;
  let fortFlag = null;
  {
    const parts = [];
    for (const b of S.fortBlocks) {
      parts.push({ geo: paint(new THREE.BoxGeometry(2.9, b.h, 1.6, 2, 2, 1), 0xf0f4fc), x: b.x, y: b.y + b.h / 2 - 0.1, z: b.z, ry: -b.a + Math.PI / 2 });
      for (const k of [-0.8, 0.8]) parts.push({ geo: paint(new THREE.BoxGeometry(0.7, 0.45, 1.5), 0xe6eef8), x: b.x + Math.sin(b.a) * k, y: b.y + b.h + 0.12, z: b.z - Math.cos(b.a) * k, ry: -b.a + Math.PI / 2 });
    }
    for (const t of S.FORT_TOWERS) {
      parts.push({ geo: paint(new THREE.CylinderGeometry(t.r, t.r * 1.1, t.h, 12), 0xf0f4fc), x: t.x, y: FORT.y + t.h / 2, z: t.z });
      for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; parts.push({ geo: paint(new THREE.BoxGeometry(0.55, 0.5, 0.55), 0xe6eef8), x: t.x + Math.cos(a) * t.r * 0.8, y: FORT.y + t.h + 0.2, z: t.z + Math.sin(a) * t.r * 0.8 }); }
    }
    // piles de boules de neige
    const r = rng(77);
    for (const [px, pz] of [[FORT.x - 5, FORT.z - 3], [FORT.x + 5, FORT.z - 4], [FORT.x - 2, FORT.z - 6.5]]) {
      for (const [dx, dy, dz] of [[-0.3, 0.22, 0], [0.3, 0.22, 0], [0, 0.22, 0.4], [0, 0.55, 0.15]]) parts.push({ geo: paint(new THREE.SphereGeometry(0.24, 10, 8), 0xf8fbff), x: px + dx, y: FORT.y + dy, z: pz + dz });
      void r;
    }
    const fm = new THREE.Mesh(merge(parts), std({ vertexColors: true, map: snowTex, roughness: 0.85 })); fm.castShadow = true; fm.receiveShadow = true; sc.add(fm);
    // drapeau de la Capitaine sur une tour
    const t = S.FORT_TOWERS[0];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), M.mat(0x3a2a24)); pole.position.set(t.x, FORT.y + t.h + 1.2, t.z); sc.add(pole);
    const ftex = canvasTex(128, 80, (x) => {
      x.fillStyle = '#ff6ab0'; x.fillRect(0, 0, 128, 80);
      x.fillStyle = '#2a2430'; x.beginPath(); x.arc(64, 44, 20, 0, 7); x.fill();
      x.beginPath(); x.moveTo(46, 34); x.lineTo(50, 14); x.lineTo(60, 28); x.fill(); x.beginPath(); x.moveTo(82, 34); x.lineTo(78, 14); x.lineTo(68, 28); x.fill();
      x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.moveTo(48, 50); x.quadraticCurveTo(64, 44, 80, 50); x.stroke();
      x.fillStyle = '#ffd23a'; x.beginPath(); x.arc(56, 40, 3.5, 0, 7); x.arc(72, 40, 3.5, 0, 7); x.fill();
    });
    const fg = new THREE.PlaneGeometry(1.5, 0.95, 8, 2); fg.translate(0.78, 0, 0);
    fortFlag = new THREE.Mesh(fg, new THREE.MeshStandardMaterial({ map: ftex, side: THREE.DoubleSide, roughness: 0.8 }));
    fortFlag.position.set(t.x, FORT.y + t.h + 1.9, t.z); sc.add(fortFlag);
    fortFlag.userData.base = fg.attributes.position.array.slice();
  }

  // --- drapeaux (points de reprise) -------------------------------------------------------------
  const flagTex = flagTexture();
  const flags = S.CHECKPOINTS.map((c) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), M.mat(0xf0e6d0, { metalness: 0.3, roughness: 0.4 }));
    pole.position.y = 1.8; g.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), M.mat(0xffd23a, { metalness: 0.6, roughness: 0.3, emissive: 0x6a4800, emissiveIntensity: 0.5 }));
    knob.position.y = 3.65; g.add(knob);
    const clothGeo = new THREE.PlaneGeometry(1.4, 0.75, 8, 3); clothGeo.translate(0.72, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8, color: 0x9a9a9a }));
    cloth.position.y = 1.0; g.add(cloth);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; halo.userData.noOutline = true; g.add(halo);
    g.position.set(c.x, c.y, c.z);
    sc.add(g);
    const up = snow().flags.includes(c.id) || c.id === 0;
    return { def: c, g, cloth, halo, base: clothGeo.attributes.position.array.slice(), raise: up ? 1 : 0, raisedAt: -9 };
  });

  // --- les habitants -----------------------------------------------------------------------------
  const folks = {};
  for (const id in S.FOLKS) {
    const f = S.FOLKS[id];
    const m = id === 'bernard' ? buildBernard() : buildMyrtille();
    m.position.set(f.x, f.y, f.z); m.rotation.y = f.yaw;
    sc.add(m); chars.push(m);
    folks[id] = { m, def: f, mark: game.makeMark(id === 'bernard' ? '!' : '?', id === 'bernard' ? 0xff9a2a : 0x8ad0ff) };
  }
  // la Capitaine Moustache, en écharpe et bonnet, dans son fort
  const cap = buildCaptain();
  {
    const u = cap.userData;
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 20), M.mat(0x3ab0e8, { roughness: 1 }));
    scarf.rotation.x = Math.PI / 2; scarf.position.set(0, -0.32, 0.05);
    if (u.head) u.head.add(scarf);
  }
  cap.scale.setScalar(1.25);
  sc.add(cap); chars.push(cap); moving.push(cap);
  const capShadow = game.makeShadow(1.0);

  // --- bonnets, boules de neige --------------------------------------------------------------------
  const bonnets = S.BONNETS.map(b => {
    const g = buildBonnet(b.col);
    const glow = glowSprite(b.col, 1.6, 0.5); g.add(glow); glow.position.y = 0.15;
    g.position.set(b.x, b.y + 0.8, b.z);
    sc.add(g); moving.push(g);
    return { def: b, g };
  });
  const SB_MAX = 28;
  const balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 1), std({ color: 0xffffff, roughness: 0.8, map: snowTex }), SB_MAX);
  balls.frustumCulled = false; balls.castShadow = true; sc.add(balls); moving.push(balls);

  // =============================================================================================
  // État et règles
  // =============================================================================================
  const st = {
    cp: snow().cp, sb: [], lastThrow: 0, iceTold: false, liftTold: false,
    boss: { phase: 'idle', x: FORT.x, y: FORT.y, z: FORT.z - 4, yaw: 0, hp: 3, t: 0, throws: 0, inv: 0, hop: null },
  };
  const B = st.boss;
  const near = (x, z) => game.nearestPlayer({ x, z });
  const headY = (P) => P.pos.y + (P.mesh && P.mesh.userData.ainu ? 1.2 : 0.8);

  function reachFlag(c) {
    const k = snow();
    if (!k.flags.includes(c.id)) { k.flags.push(c.id); const f = flags[c.id]; f.raisedAt = game.t; game.sound('cp'); game.burst(c.x, c.y + 3.6, c.z, 20, 0xffe070, 4, 0.8); game.banner('Drapeau !', `${c.name} : on repartira d'ici.`, 1800); }
    if (k.cp !== c.id) { k.cp = c.id; st.cp = c.id; game.persist(); }
  }

  // --- luge ---------------------------------------------------------------------------------------
  function startSled(P) {
    if (P.ride) return;
    const s0 = S.SLED_START, c = S.runAt(s0.s);
    P.attackT = 0; P.dashT = 0;
    P.pos.set(c.x, S.heightAt(c.x, c.z), c.z); P.yaw = Math.atan2(c.dx, c.dz); P.vel.set(0, 0, 0);
    // la luge suit la piste (s : distance parcourue, u : écart sur le côté)
    P.ride = { kind: 'sled', s: s0.s, u: 0, uv: 0, yaw: P.yaw, speed: 5, vy: 0, air: false, t0: game.t };
    game.sound('dash');
    if (!snow().sledTip) { snow().sledTip = 1; game.persist(); const k = game.controlsHelp(); game.banner('Attention… Glissade !', `Penchez-vous à gauche ou à droite · ${k.jump} : petit saut`, 3200); }
  }
  function endRide(P, vy) {
    const R = P.ride;
    if (!R) return;
    P.ride = null;
    P.vel.set(Math.sin(P.yaw) * Math.min(R.speed || 0, 6), vy === undefined ? 3 : vy, Math.cos(P.yaw) * Math.min(R.speed || 0, 6));
    P.grounded = false; P.jumps = 1;
    if (P.mesh) { P.mesh.rotation.x = 0; P.mesh.rotation.z = 0; }
  }
  function finishSled(P) {
    const R = P.ride, k = snow(), tm = game.t - R.t0;
    endRide(P, 4);
    game.sound('win');
    for (let i = 0; i < 3; i++) game.burst(S.FINISH.x + (i - 1) * 3, S.heightAt(S.FINISH.x, S.FINISH.z) + 3.5, S.FINISH.z, 16, [0xff5a6a, 0xffd23a, 0x5ac8ff][i], 4.5, 0.9);
    const best = !k.best || tm < k.best;
    if (best) k.best = Math.round(tm * 10) / 10;
    const first = !k.sled;
    k.sled = true; game.persist();
    P.cheerT = 1.4;
    const t = (Math.round(tm * 10) / 10).toFixed(1).replace('.', ',');
    if (first) { game.updateMedalVisibility(); game.banner('Bravo, quelle glissade !', `Une médaille brille sous l'arche d'arrivée ! (${t} s)`, 3200); game.sound('reveal'); }
    else game.banner(`Descente : ${t} s`, best ? 'Nouveau record !' : `Record : ${String(k.best).replace('.', ',')} s`, 2400);
  }
  function stepSled(P, R, wx, wz, pr, dt) {
    const frozen = game.dialog || game.freeze > 0;
    if (frozen) { wx = 0; wz = 0; }
    const c = S.runAt(R.s), nx = c.dz, nz = -c.dx;            // n : à gauche de la piste (vu de derrière)
    // pente le long de la piste : ça accélère dans les descentes
    const f = S.runAt(R.s + 1.5), b = S.runAt(R.s - 1.5);
    const dh = (S.heightAt(f.x, f.z) - S.heightAt(b.x, b.z)) / 3;
    R.speed += (-dh * 22 - 0.35 - 0.012 * R.speed * R.speed) * dt;
    // tirer en arrière : on freine
    const fwd = wx * c.dx + wz * c.dz, lat = wx * nx + wz * nz;
    if (fwd < -0.5 && Math.abs(lat) < 0.5) R.speed -= 7 * dt;
    R.speed = clamp(R.speed, R.s < S.RUN_TOTAL - 12 ? 3 : 1.5, 17);
    // se pencher : on glisse vers le côté
    const lim = S.RUN_W - 0.7;
    R.uv += (clamp(lat, -1, 1) * 7.5 - R.uv) * Math.min(1, dt * 5);
    R.u += R.uv * dt;
    if (Math.abs(R.u) > lim) { R.u = Math.sign(R.u) * lim; if (Math.abs(R.uv) > 4) game.burst(P.pos.x, P.pos.y + 0.3, P.pos.z, 5, 0xffffff, 2, 0.35); R.uv = 0; }
    R.s += R.speed * dt;
    const p = S.runAt(R.s), qx = p.dz, qz = -p.dx;
    P.pos.x = p.x + qx * R.u; P.pos.z = p.z + qz * R.u;
    const ground = game.support(P.pos.x, P.pos.z, P.pos.y + 0.6).y;
    if (pr.has('jump') && !R.air && !frozen) { R.vy = 7.5; R.air = true; game.sound('jump'); }
    if (R.air) {
      R.vy -= 30 * dt; P.pos.y += R.vy * dt;
      if (P.pos.y <= ground) { P.pos.y = ground; R.air = false; R.vy = 0; game.burst(P.pos.x, ground + 0.2, P.pos.z, 8, 0xffffff, 2.5, 0.4); }
    } else P.pos.y = ground;
    const base = Math.atan2(p.dx, p.dz);
    P.yaw = base + Math.atan2(R.uv, Math.max(R.speed, 2)) * 0.8;   // (le cap augmente vers n)
    R.yaw = base;
    P.vel.set(p.dx * R.speed + qx * R.uv, R.air ? R.vy : 0, p.dz * R.speed + qz * R.uv);
    P.grounded = !R.air;
    // arrivée
    if (R.s >= S.RUN_TOTAL - 0.5) finishSled(P);
  }

  // --- télésiège -----------------------------------------------------------------------------------
  function startLift(P) {
    if (P.ride) return;
    const taken = game.players.filter(Q => Q.ride && Q.ride.kind === 'lift').map(Q => Q.ride.slot);
    let slot = 0; while (taken.includes(slot)) slot++;
    P.attackT = 0; P.dashT = 0; P.vel.set(0, 0, 0);
    P.ride = { kind: 'lift', s: 0, speed: S.LIFT_SPEED, yaw: liftYaw, slot: Math.min(slot, RIDERS - 1) };
    P.yaw = liftYaw;
    game.sound('switch');
    if (!st.liftTold) { st.liftTold = true; game.banner('En route vers le sommet !', 'Le télésiège vous dépose tout en haut', 2200); }
  }
  function liftPos(s) { const p = S.liftAt(s); return { x: p.x + side.x * LANE, y: p.y - S.SEAT_DROP, z: p.z + side.z * LANE }; }
  function stepLift(P, R, dt) {
    R.s += S.LIFT_SPEED * dt;
    const p = liftPos(R.s);
    P.pos.set(p.x, p.y + 0.1, p.z); P.yaw = liftYaw; R.yaw = liftYaw;
    P.vel.set(liftDir.x * S.LIFT_SPEED, 0, liftDir.z * S.LIFT_SPEED);
    P.grounded = true;
    if (R.s >= S.LIFT_LEN) {
      const D = S.TOP_DECK;
      P.ride = null;
      const i = P.id || 0;
      P.pos.set(D.x + Math.cos(i * 1.3) * 0.8, S.heightAt(D.x, D.z) + 0.25, D.z + Math.sin(i * 1.3) * 0.8);
      P.vel.set(liftDir.x * 2, 3, liftDir.z * 2); P.grounded = false; P.jumps = 1;
      game.sound('reveal');
      game.burst(P.pos.x, P.pos.y + 1, P.pos.z, 16, 0xffffff, 3, 0.6);
      if (!snow().summit) { snow().summit = 1; game.persist(); game.banner('Le sommet !', 'Bernard le sauveteur vous attend · la Grande Glissade aussi !', 3000); }
    }
  }

  // --- boules de neige -------------------------------------------------------------------------------
  function throwBall(fx, fy, fz, P, big) {
    if (st.sb.length >= SB_MAX) return;
    const lead = big ? 0.35 : 0.5;
    const tx = P.pos.x + P.vel.x * lead, tz = P.pos.z + P.vel.z * lead, ty = P.pos.y + 0.8;
    const d = Math.hypot(tx - fx, tz - fz), T = clamp(d / (big ? 10 : 12), 0.45, 1.3), g = 14;
    st.sb.push({ x: fx, y: fy, z: fz, vx: (tx - fx) / T, vz: (tz - fz) / T, vy: (ty - fy + 0.5 * g * T * T) / T, t: 0, big: !!big });
    game.sound('throw');
  }
  function stepBalls(dt) {
    const g = 14;
    st.sb = st.sb.filter((b) => {
      b.t += dt; b.vy -= g * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      for (const P of game.players) {
        const r = b.big ? 1.15 : 0.85;
        if ((P.pos.x - b.x) ** 2 + (headY(P) - 0.3 - b.y) ** 2 + (P.pos.z - b.z) ** 2 < r * r) {
          // ça ne fait pas mal : juste « pouf », et ça pousse un peu
          game.burst(b.x, b.y, b.z, b.big ? 18 : 10, 0xffffff, 3.5, 0.5);
          game.sound('poof');
          if (!P.ride) {
            const l = Math.hypot(b.vx, b.vz) || 1;
            P.vel.x += b.vx / l * (b.big ? 6 : 3.5); P.vel.z += b.vz / l * (b.big ? 6 : 3.5);
            if (P.grounded) { P.vel.y = b.big ? 4.5 : 2.5; P.grounded = false; }
          }
          if (game.t - (P.brrT || -9) > 2.5) { P.brrT = game.t; game.bubble(P, Math.random() < 0.5 ? 'Brrr !' : 'Pouf !'); }
          if (!snow().ballTold) { snow().ballTold = 1; game.persist(); game.banner('Pouf ! Une boule de neige !', 'Ça ne fait pas mal… mais ça chatouille ! Un « Ouaf ! » fait fuir les chats.', 3200); }
          return false;
        }
      }
      if (b.y < S.heightAt(b.x, b.z) || b.t > 3) { game.burst(b.x, Math.max(b.y, S.heightAt(b.x, b.z)) + 0.1, b.z, 6, 0xffffff, 2, 0.35); return false; }
      return true;
    });
  }
  function catThrows() {
    if (game.t - st.lastThrow < 0.7) return;
    for (const c of game.cats) {
      if (c.dead || c.flee > 0 || c.chasing) continue;
      if ((c.sbT = (c.sbT === undefined ? 1 + Math.random() * 3 : c.sbT)) > game.t) continue;
      const P = near(c.pos.x, c.pos.z);
      const d = Math.hypot(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      if (d < 6 || d > 16 || Math.abs(P.pos.y - c.pos.y) > 5 || (P.ride && P.ride.kind === 'lift')) { c.sbT = game.t + 0.6; continue; }
      c.yaw = Math.atan2(P.pos.x - c.pos.x, P.pos.z - c.pos.z);
      c.throwAnim = game.t;
      throwBall(c.pos.x + Math.sin(c.yaw) * 0.4, c.pos.y + 0.9, c.pos.z + Math.cos(c.yaw) * 0.4, P, false);
      c.sbT = game.t + (game.easy ? 4.5 : 3) + Math.random() * 2.5;
      st.lastThrow = game.t;
      return;
    }
  }

  // --- la bataille du Fort Moustache ---------------------------------------------------------------------
  function bossReset() { Object.assign(B, { phase: 'idle', x: FORT.x, z: FORT.z - 4, y: FORT.y, hp: 3, t: 0, throws: 0, inv: 0, hop: null }); }
  function stepBoss(dt) {
    if (snow().fort) { if (B.phase !== 'friend' && B.phase !== 'won') { B.phase = 'friend'; B.x = FORT.x + 2.5; B.z = FORT.z - 4; B.y = FORT.y; } }
    const p = near(B.x, B.z);
    const dA = (q) => Math.hypot(q.pos.x - FORT.x, q.pos.z - FORT.z);
    const inFort = game.players.some(q => dA(q) < FORT.r - 1.2 && Math.abs(q.pos.y - FORT.y) < 3 && !q.ride);
    const far = game.players.every(q => dA(q) > FORT.r + 10);
    B.inv = Math.max(0, B.inv - dt);
    if (B.phase === 'friend' || B.phase === 'won') { B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 3); return; }
    if (B.phase === 'idle') {
      B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 3);
      if (inFort && !game.dialog && save().intro) {
        B.phase = 'intro';
        game.say([
          { who: 'Capitaine Moustache', text: 'Miaou-ha-ha ! Les voilà, mes chiens préférés ! Bienvenue au Fort Moustache !' },
          { who: 'Capitaine Moustache', text: 'Le jeu est simple : je vous lance des boules de neige… et vous essayez de m\'attraper !' },
          { who: 'Matcha', text: 'Quand elle est essoufflée, on fonce, Ainu !' },
        ], () => { B.phase = 'throw'; B.t = 0.8; B.throws = 0; });
      }
      return;
    }
    if (B.phase === 'intro') return;
    if (far) { bossReset(); return; }
    B.t -= dt;
    if (B.phase === 'throw') {
      B.yaw = lerpAngle(B.yaw, Math.atan2(p.pos.x - B.x, p.pos.z - B.z), dt * 6);
      if (B.t <= 0) {
        throwBall(B.x + Math.sin(B.yaw) * 0.6, B.y + 1.6, B.z + Math.cos(B.yaw) * 0.6, p, true);
        B.throws++;
        B.t = B.throws >= 3 ? 0.8 : 1.25;
        if (B.throws >= 3) B.phase = 'wait';
      }
    } else if (B.phase === 'wait') {
      if (B.t <= 0) { B.phase = 'tired'; B.t = game.easy ? 6 : 4.5; game.banner('Elle est essoufflée !', 'Vite, attrapez-la !', 1500); }
    } else if (B.phase === 'tired') {
      if (B.t <= 0) { B.phase = 'throw'; B.t = 0.6; B.throws = 0; }
    } else if (B.phase === 'hop') {
      const h = B.hop; h.t += dt;
      const k = Math.min(1, h.t / h.T);
      B.x = h.x0 + (h.x1 - h.x0) * k; B.z = h.z0 + (h.z1 - h.z0) * k; B.y = FORT.y + Math.sin(k * Math.PI) * 3.5;
      if (k >= 1) { B.y = FORT.y; B.phase = 'throw'; B.t = 0.8; B.throws = 0; }
    }
    // les chiens qui l'attrapent (seulement quand elle souffle)
    for (const q of game.players) {
      if (B.phase === 'hop') break;
      const d = Math.hypot(q.pos.x - B.x, q.pos.z - B.z), dy = q.pos.y - B.y;
      if (d < 2.3 && dy > -1 && dy < 3) {
        const attacking = q.attackT > 0 || q.dashT > 0 || (q.vel.y < -1 && dy > 1.0) || (q.barkT || 0) > 0.55;
        if (B.phase === 'tired' && attacking && B.inv <= 0) { hitBoss(q); break; }
        // sinon : elle esquive en riant (et pousse gentiment)
        if (d < 1.4 && B.phase !== 'tired') { const l = d || 1; q.vel.x += (q.pos.x - B.x) / l * 3; q.vel.z += (q.pos.z - B.z) / l * 3; }
      }
    }
  }
  function hitBoss(q) {
    B.hp--; B.inv = 1;
    game.sound('bossHit');
    game.burst(B.x, B.y + 1.6, B.z, 26, 0xffffff, 5, 0.7);
    if (q.vel.y < 0) q.vel.y = 9;
    if (B.hp <= 0) {
      B.phase = 'won';
      st.sb.length = 0;
      game.say([
        { who: 'Capitaine Moustache', text: 'Pouce ! Pouce ! Vous m\'avez attrapée trois fois !' },
        { who: 'Capitaine Moustache', text: 'C\'était la meilleure bataille de boules de neige de toute ma vie. Tenez, voilà votre médaille.' },
        { who: 'Ainu', text: 'Ouaf ! On refait une partie quand tu veux !' },
      ], () => {
        snow().fort = true; game.persist();
        B.phase = 'friend';
        game.updateMedalVisibility();
        game.banner('Bataille gagnée !', 'Une Médaille des Neiges brille dans le fort !', 3000);
        game.sound('reveal');
      });
      return;
    }
    game.banner(B.hp === 2 ? 'Attrapée !' : 'Encore une fois !', `Il reste ${B.hp} fois`, 1400);
    const a = Math.random() * Math.PI * 2, r = 2.5 + Math.random() * 3.5;
    B.phase = 'hop'; B.hop = { t: 0, T: 0.9, x0: B.x, z0: B.z, x1: FORT.x + Math.cos(a) * r, z1: FORT.z + Math.sin(a) * r };
  }

  // --- dialogues ------------------------------------------------------------------------------------
  function talkBernard() {
    const k = snow(), n = k.bonnets.length;
    if (!k.metBernard) {
      game.say([
        { who: 'Bernard', text: 'Wouf ! Bonjour, les petits ! Je suis Bernard, le sauveteur de la montagne.' },
        { who: 'Bernard', text: 'Si quelqu\'un a froid ou se perd dans la neige, j\'arrive avec mon tonnelet de chocolat chaud !' },
        { who: 'Matcha', text: 'Du chocolat ? Moi, j\'ai un peu froid aux pattes…' },
        { who: 'Bernard', text: 'Ha ha ! Dites, vous pourriez m\'aider ? Le vent a emporté les trois bonnets à pompon des chiots de l\'école de ski.' },
        { who: 'Bernard', text: 'Un rouge sur l\'îlot du lac gelé, un bleu sur un bloc de la Cascade Gelée, et un jaune sur le toit de la gare du télésiège.' },
        { who: 'Ainu', text: 'Ouaf ! On les retrouve, promis !' },
        { who: 'Bernard', text: 'Et pour redescendre, prenez une luge, juste là : c\'est la Grande Glissade ! Penchez-vous pour tourner.' },
      ], () => { k.metBernard = true; game.persist(); game.updateHud(); });
      return;
    }
    if (n >= S.BONNETS.length) {
      game.say([{ who: 'Bernard', text: save().medals.includes('m_bonnets') ? 'Merci, les petits ! Et n\'oubliez pas : une bonne glissade, ça réchauffe !' : 'Les trois bonnets ! Les chiots de l\'école de ski vont être tout contents. Tenez, cette médaille est pour vous !' }]);
      return;
    }
    const left = S.BONNETS.filter(b => !k.bonnets.includes(b.id));
    game.say([
      { who: 'Bernard', text: `Encore ${left.length} bonnet${left.length > 1 ? 's' : ''} à retrouver. Courage, les petits !` },
      { who: 'Bernard', text: `Il y en a un ${left[0].where}.` },
    ]);
  }
  function talkMyrtille() {
    const k = snow(), s = save();
    if (!k.metMyrtille) {
      game.say([
        { who: 'Myrtille', text: 'Oh ! Vous devez être Ainu et Matcha ! Votre Mamie m\'a tellement parlé de vous.' },
        { who: 'Myrtille', text: 'Je suis Myrtille. Mamie et moi, on se connaît depuis qu\'on est toutes petites !' },
        { who: 'Myrtille', text: 'Ici, c\'est mon chalet-chocolat. Quand vous aurez trouvé les cinq médailles, je vous prépare une grande fête avec du chocolat chaud !' },
        { who: 'Biscotte', text: 'Avec de la crème fouettée ?' },
        { who: 'Myrtille', text: 'Avec plein de crème fouettée !' },
      ], () => { k.metMyrtille = true; game.persist(); });
      return;
    }
    if (s.medals.length >= S.medals.length) { game.say([{ who: 'Myrtille', text: 'Le chocolat est prêt ! Merci d\'avoir rendu la joie à toute la station.' }]); return; }
    const tips = [
      'Un petit conseil : sur la glace, on ne freine pas facilement. Prenez votre élan… et glissez !',
      'Les blocs de la Cascade Gelée sont hauts : sautez deux fois pour monter !',
      'Le télésiège part de la gare au toit plat, au nord du village. Tout là-haut, il y a des luges !',
      'La Capitaine adore les boules de neige. Quand elle est essoufflée, c\'est le moment de l\'attraper !',
    ];
    k.tip = ((k.tip | 0) + 1) % tips.length;
    game.say([{ who: 'Myrtille', text: tips[k.tip] }]);
  }

  // =============================================================================================
  const logic = {
    moving, chars,
    playerStep(P, wx, wz, jumpHeld, pr, dt) {
      const R = P.ride;
      if (!R) return false;
      P.invuln = Math.max(0, P.invuln - dt);
      P.cheerT = Math.max(0, P.cheerT - dt);
      P.flipT = 0; P.attackT = 0; P.dashT = 0;
      if (R.kind === 'sled') {
        if (pr.has('talk') && !game.dialog) { pr.delete('talk'); endRide(P, 3); return true; }
        stepSled(P, R, wx, wz, pr, dt);
      } else stepLift(P, R, dt);
      return true;
    },
    nearFor(Q) {
      if (!Q.ride) return undefined;
      return Q.ride.kind === 'sled' ? { kind: 'lv', act: 'exit', label: 'DESCENDRE', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y } : null;
    },
    extraCandidates() {
      const out = [];
      const R = S.SLED_RACK, B0 = LIFT.base;
      out.push({ kind: 'lv', act: 'sled', label: 'LUGE', x: R.x, z: R.z, y: R.y });
      out.push({ kind: 'lv', act: 'sled', label: 'LUGE', x: S.SLED_START.x, z: S.SLED_START.z, y: S.heightAt(S.SLED_START.x, S.SLED_START.z) });
      out.push({ kind: 'lv', act: 'lift', label: 'TÉLÉSIÈGE', x: B0.x, z: B0.z, y: B0.y });
      for (const id in folks) { const f = folks[id].def; out.push({ kind: 'lv', act: 'talk', id, label: 'PARLER', x: f.x, z: f.z, y: f.y }); }
      if (B.phase === 'friend') out.push({ kind: 'lv', act: 'talk', id: 'cap', label: 'PARLER', x: B.x, z: B.z, y: B.y });
      return out;
    },
    interact(n, P) {
      if (n.act === 'sled') startSled(P);
      else if (n.act === 'lift') startLift(P);
      else if (n.act === 'exit') endRide(P, 3);
      else if (n.id === 'bernard') talkBernard();
      else if (n.id === 'myrtille') talkMyrtille();
      else if (n.id === 'cap') game.say([{ who: 'Capitaine Moustache', text: 'Je rends tout, promis. Bon… presque tout. Je garde une boule de neige, pour plus tard !' }]);
    },
    step(dt) {
      const players = game.players, k = snow();
      for (const P of players) {
        // drapeaux
        for (const c of S.CHECKPOINTS) if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 3.5 && Math.abs(P.pos.y - c.y) < 3 && (k.cp !== c.id || !k.flags.includes(c.id))) reachFlag(c);
        // bonnets
        for (const b of S.BONNETS) {
          if (k.bonnets.includes(b.id)) continue;
          if (Math.hypot(P.pos.x - b.x, P.pos.z - b.z) < 1.5 && Math.abs(P.pos.y + 0.6 - (b.y + 0.8)) < 1.6) {
            k.bonnets.push(b.id); game.persist();
            game.burst(b.x, b.y + 0.8, b.z, 20, b.col, 4, 0.7);
            game.sound('ball');
            if (k.bonnets.length >= S.BONNETS.length) {
              game.updateMedalVisibility(); game.sound('reveal');
              game.banner('Les 3 bonnets !', 'Une médaille brille près de Bernard, au sommet de la montagne !', 3200);
            } else game.banner(`Bonnet à pompon ${k.bonnets.length}/${S.BONNETS.length}`, k.metBernard ? 'Encore un, et Bernard sera content !' : 'C\'est à l\'école de ski : Bernard le cherche, au sommet !', 2000);
          }
        }
        // sur la glace : la première fois, on explique
        if (!st.iceTold && P === game.me && P.grounded && S.iceAt(P.pos.x, P.pos.z, P.pos.y)) { st.iceTold = true; game.banner('Ça glisse !', 'Sur la glace, on patine : prenez de l\'élan et glissez !', 2600); }
      }
      catThrows();
      stepBalls(dt);
      stepBoss(dt);
    },
    reveal() {
      const s = save(), k = snow();
      return {
        m_lake: S.cats.filter(c => c.group === 'clearing').every(c => s.cats.includes(c.id)),
        m_bonnets: k.bonnets.length >= S.BONNETS.length,
        m_sled: !!k.sled,
        m_falls: true,
        m_fort: !!k.fort,
      };
    },
    applySave() {
      const k = snow();
      st.cp = k.cp;
      flags.forEach((f) => { f.raise = k.flags.includes(f.def.id) || f.def.id === 0 ? 1 : 0; });
      if (k.fort && B.phase !== 'won') { B.phase = 'friend'; }
    },
    respawn(P) {
      if (P.ride) endRide(P, 0);
      if (B.phase !== 'idle' && B.phase !== 'friend' && B.phase !== 'won' && Math.hypot(P.pos.x - FORT.x, P.pos.z - FORT.z) < FORT.r + 6) {
        bossReset();
        return { x: FORT.x, y: S.heightAt(FORT.x, FORT.z + FORT.r + 5), z: FORT.z + FORT.r + 5, yaw: Math.PI };
      }
      if (game.mode === 'defi') { const c = S.CHECKPOINTS[st.cp] || S.CHECKPOINTS[0]; return { x: c.x, y: c.y + 0.2, z: c.z + 1.5 }; }
      return null;
    },
    guideTarget(me) {
      const s = save(), k = snow();
      const cands = [];
      const has = (id) => s.medals.includes(id);
      for (const m of game.medals) if (m.mesh.visible) cands.push(m.def);
      if (!has('m_lake') && !this.reveal().m_lake) for (const c of game.cats) if (!c.dead && c.def.group === 'clearing') cands.push({ x: c.pos.x, y: c.pos.y, z: c.pos.z });
      if (!has('m_bonnets') && k.metBernard) for (const b of S.BONNETS) if (!k.bonnets.includes(b.id)) cands.push(b);
      if (!k.metBernard && !has('m_bonnets')) cands.push(S.FOLKS.bernard);
      if (!k.sled) cands.push(me.pos.y > 20 ? { x: S.SLED_RACK.x, y: S.SLED_RACK.y, z: S.SLED_RACK.z } : LIFT.base);
      if (!k.fort) cands.push({ x: FORT.x, y: FORT.y, z: FORT.z });
      let best = null, bd = Infinity;
      for (const c of cands) { const d = Math.hypot(c.x - me.pos.x, c.z - me.pos.z); if (d < bd) { bd = d; best = c; } }
      return best ? { x: best.x, y: best.y, z: best.z } : null;
    },
    camFocus() { return ['throw', 'wait', 'tired', 'hop'].includes(B.phase) ? { x: B.x, y: B.y + 1, z: B.z } : null; },
    questText() {
      const s = save(), k = snow();
      if (!s.intro) return 'Parle à Mamie Labrador';
      if (['throw', 'wait', 'tired', 'hop'].includes(B.phase)) return `Bataille de boules de neige ! Attrapez la Capitaine (${B.hp} fois)`;
      const n = s.medals.length, tot = S.medals.length;
      if (n >= tot) return `Station en fête ! Médailles ${n}/${tot}`;
      const extra = k.metBernard && k.bonnets.length < S.BONNETS.length ? ` · Bonnets ${k.bonnets.length}/${S.BONNETS.length}` : '';
      return `Médailles des Neiges ${n}/${tot}${extra}`;
    },
    minimapMarks() {
      const out = [], k = snow();
      S.CHECKPOINTS.forEach((c) => out.push([c.x, c.z, k.flags.includes(c.id) || c.id === 0 ? '#ffd23a' : '#ffffff', 2.4]));
      out.push([LIFT.base.x, LIFT.base.z, '#3a8ae0', 3]);
      out.push([S.SLED_RACK.x, S.SLED_RACK.z, '#e8402e', 3]);
      for (const id in folks) out.push([folks[id].def.x, folks[id].def.z, '#ff9a2a', 3.2, id === 'bernard' && !k.metBernard]);
      if (k.metBernard) for (const b of S.BONNETS) if (!k.bonnets.includes(b.id)) out.push([b.x, b.z, '#' + b.col.toString(16).padStart(6, '0'), 3, true]);
      if (!k.fort) out.push([FORT.x, FORT.z, '#ff6ab0', 3.6]);
      return out;
    },
    snapshot() {
      const r = (v) => Math.round(v * 100) / 100;
      return {
        cp: st.cp,
        rd: game.players.filter(P => P.ride).map(P => [P.id, P.ride.kind === 'sled' ? 1 : 2, r(P.ride.speed || 0), P.ride.slot || 0, P.ride.air ? 1 : 0]),
        sb: st.sb.map(b => [r(b.x), r(b.y), r(b.z), r(b.vx), r(b.vy), r(b.vz), b.big ? 1 : 0]),
        b: [B.phase, r(B.x), r(B.y), r(B.z), r(B.yaw), B.hp, r(B.inv)],
      };
    },
    apply(x) {
      st.cp = x.cp;
      const rides = new Map(x.rd.map(d => [d[0], d]));
      for (const P of game.players) {
        const d = rides.get(P.id);
        if (!d) { if (P.ride) { P.ride = null; if (P.mesh) { P.mesh.rotation.x = 0; P.mesh.rotation.z = 0; } } continue; }
        P.ride = P.ride && P.ride.kind === (d[1] === 1 ? 'sled' : 'lift') ? P.ride : { kind: d[1] === 1 ? 'sled' : 'lift' };
        P.ride.speed = d[2]; P.ride.slot = d[3]; P.ride.air = !!d[4]; P.ride.yaw = P.yaw;
      }
      st.sb = x.sb.map(d => ({ x: d[0], y: d[1], z: d[2], vx: d[3], vy: d[4], vz: d[5], big: !!d[6], t: 0 }));
      const [ph, bx, by, bz, yaw, hp, inv] = x.b;
      B.phase = ph; B.hp = hp; B.yaw = yaw; B.inv = inv;
      B.x += (bx - B.x) * 0.5; B.y += (by - B.y) * 0.5; B.z += (bz - B.z) * 0.5;
    },
    talkMamie(first) {
      const s = save(), k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Bienvenue à la Station des Neiges, mes toutous ! Regardez-moi toute cette neige !' },
          { who: 'Biscotte', text: 'De la neige ! Je peux faire des roulades dedans ?' },
          { who: 'Mamie Labrador', text: 'Mon amie Myrtille tient le chalet-chocolat, sur la place. Et là-haut, sur la montagne, il y a Bernard, le sauveteur.' },
          { who: 'Mamie Labrador', text: 'Mais la Capitaine Moustache n\'a pas pu s\'en empêcher : avec ses chats farceurs, elle a caché les cinq Médailles des Neiges de la station !' },
          { who: 'Matcha', text: 'Encore elle ! Je croyais qu\'elle était notre copine, maintenant ?' },
          { who: 'Mamie Labrador', text: 'Oh, elle n\'est pas méchante : elle veut jouer. Elle vous attend dans son fort de neige, pour une grande bataille de boules de neige !' },
          { who: 'Mamie Labrador', text: 'Sur le lac gelé, ça glisse : prenez de l\'élan, puis lâchez tout pour patiner. Et un bon « Ouaf ! » fait détaler les chats.' },
          { who: 'Mamie Labrador', text: `Le télésiège monte au sommet : approchez-vous et appuyez sur ${game.isTouch ? 'TÉLÉSIÈGE' : 'F'}. De là-haut, une luge, et c'est la Grande Glissade !` },
          { who: 'Ainu', text: 'Ouaf ! De la luge ! On y va, Matcha !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Trouvez les 5 Médailles des Neiges !', 2800); game.updateHud(); });
        void k;
        return;
      }
      if (s.medals.length >= S.medals.length) { game.say([{ who: 'Mamie Labrador', text: 'Bravo, mes toutous ! Toute la station est en fête. Il reste peut-être des flocons dorés à trouver…' }]); return; }
      const kk = snow(), rv = this.reveal();
      const hints = {
        m_lake: rv.m_lake ? 'Les chats du lac ont filé ! Leur médaille brille sur l\'îlot, au milieu de la glace.' : 'Des chats patinent sur le lac gelé, à l\'est. Faites-les détaler !',
        m_bonnets: kk.metBernard ? 'Bernard cherche encore des bonnets à pompon. Regardez sur la carte !' : 'Bernard, le sauveteur, attend au sommet de la montagne. Il a besoin d\'aide !',
        m_sled: 'Prenez une luge au sommet, et descendez la Grande Glissade jusqu\'à l\'arrivée !',
        m_falls: 'À l\'ouest, la Cascade Gelée : grimpez de bloc de glace en bloc de glace jusqu\'en haut !',
        m_fort: 'Le Fort Moustache est au nord-est, derrière le lac. La Capitaine vous attend pour la bataille !',
      };
      const left = S.medals.filter(m => !s.medals.includes(m.id)).map(m => hints[m.id]).filter(Boolean);
      game.say([{ who: 'Mamie Labrador', text: `Vous avez ${s.medals.length} médaille${s.medals.length > 1 ? 's' : ''} sur 5.` }, ...left.slice(0, 2).map(t => ({ who: 'Mamie Labrador', text: t }))]);
    },
    endLines() {
      const kid = window.kidName ? window.kidName() : '';
      return [
        { who: 'Mamie Labrador', text: 'Les cinq Médailles des Neiges ! La station est en fête grâce à vous !' },
        { who: 'Myrtille', text: 'Le chocolat chaud est servi ! Avec plein de crème fouettée, comme promis.' },
        { who: 'Bernard', text: 'Et un tonnelet de plus pour les héros de la montagne ! Wouf !' },
        { who: 'Capitaine Moustache', text: '…Je peux en avoir aussi ? Moi aussi, j\'ai froid aux moustaches.' },
        { who: 'Mamie Labrador', text: 'Bien sûr ! Ici, tout le monde a sa tasse. Même les chats farceurs.' },
        { who: 'Biscotte', text: 'Demain, on refait la Grande Glissade tous ensemble !' },
        { who: 'Matcha', text: 'Et cette fois, c\'est moi qui conduis la luge !' },
        { who: 'Ainu', text: 'Ouaf ! Le plus bel hiver de toute ma vie.' },
        ...(kid ? [{ who: '', text: `Et tout ça, grâce à ${kid}.` }] : []),
      ];
    },
    render(dt, t) {
      const me = game.me, k = snow(), cam = game.camera.position;
      // sièges du télésiège qui tournent en boucle
      const m4 = this._m4 || (this._m4 = new THREE.Matrix4()), q = this._q || (this._q = new THREE.Quaternion()), v = this._v || (this._v = new THREE.Vector3()), one = this._one || (this._one = new THREE.Vector3(1, 1, 1)), zero = new THREE.Vector3(0, 0, 0), e = this._e || (this._e = new THREE.Euler());
      const loop = S.LIFT_LEN * 2;
      for (let i = 0; i < CHAIRS; i++) {
        const u = ((t * S.LIFT_SPEED + i * loop / CHAIRS) % loop);
        const up = u < S.LIFT_LEN, s = up ? u : loop - u, p = S.liftAt(s), sd = up ? 1 : -1;
        const swing = Math.sin(t * 1.3 + i) * 0.05;
        m4.compose(v.set(p.x + side.x * LANE * sd, p.y, p.z + side.z * LANE * sd), q.setFromEuler(e.set(swing, liftYaw + (up ? 0 : Math.PI), 0, 'YXZ')), one);
        chairs.setMatrixAt(i, m4);
      }
      const used = new Set();
      for (const P of game.players) {
        const R = P.ride;
        if (!R) continue;
        const u = P.mesh && P.mesh.userData;
        if (R.kind === 'lift') {
          const slot = Math.min(R.slot || 0, RIDERS - 1); used.add(slot);
          m4.compose(v.set(P.pos.x, P.pos.y - 0.1 + S.SEAT_DROP, P.pos.z), q.setFromEuler(e.set(0, liftYaw, 0)), one);
          chairs.setMatrixAt(CHAIRS + slot, m4);
          if (P.mesh) {
            P.mesh.position.set(P.pos.x, P.pos.y - 0.05, P.pos.z); P.mesh.rotation.set(0, liftYaw, 0);
            if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = (i < 2 ? -1.1 : 1.0) + Math.sin(t * 3 + i) * 0.15; });
            if (u.ainu) { u.ainu.position.y = -0.25; u.ainu.rotation.x = 0; }
            if (P.shadow) P.shadow.visible = false;
          }
        }
      }
      for (let i = 0; i < RIDERS; i++) if (!used.has(i)) { m4.compose(v.set(0, -500, 0), q.identity(), zero); chairs.setMatrixAt(CHAIRS + i, m4); }
      chairs.instanceMatrix.needsUpdate = true;
      // luges
      let si = 0;
      for (const P of game.players) {
        const R = P.ride;
        if (!R || R.kind !== 'sled') continue;
        const sl = sledFor(si++);
        const e2 = 0.6, gf = (S.heightAt(P.pos.x + Math.sin(P.yaw) * e2, P.pos.z + Math.cos(P.yaw) * e2) - S.heightAt(P.pos.x - Math.sin(P.yaw) * e2, P.pos.z - Math.cos(P.yaw) * e2)) / (2 * e2);
        const pitch = R.air ? -0.1 : -Math.atan(gf);
        sl.visible = true; sl.position.set(P.pos.x, P.pos.y + 0.02, P.pos.z); sl.rotation.set(pitch, P.yaw, 0, 'YXZ');
        if (P.mesh) {
          const u = P.mesh.userData;
          P.mesh.position.set(P.pos.x, P.pos.y + 0.3, P.pos.z); P.mesh.rotation.set(pitch, P.yaw, 0, 'YXZ');
          if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = i < 2 ? -1.0 : 1.2; });
          if (u.ainu) { u.ainu.position.y = -0.1; u.ainu.rotation.x = 0; u.ainu.rotation.z = 0; }
          if (u.tail) u.tail.rotation.set(-0.6, Math.sin(t * 10) * 0.3, 0);
        }
        // poudreuse qui vole
        if ((R.speed || 0) > 4 && !R.air && Math.random() < dt * (R.speed * 2.5)) {
          const b = -0.9;
          game.spawnParticle(P.pos.x + Math.sin(P.yaw) * b + (Math.random() - 0.5) * 0.8, P.pos.y + 0.15, P.pos.z + Math.cos(P.yaw) * b + (Math.random() - 0.5) * 0.8,
            (Math.random() - 0.5) * 2, 1.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2, 0xffffff, 0.3 + Math.random() * 0.2, 0.6, 5);
        }
      }
      for (let i = si; i < sledPool.length; i++) sledPool[i].visible = false;
      // patins sur la glace : copeaux de glace
      for (const P of game.players) {
        if (P.ride || !P.grounded) continue;
        const sp = Math.hypot(P.vel.x, P.vel.z);
        if (sp > 3 && S.iceAt(P.pos.x, P.pos.z, P.pos.y) && Math.random() < dt * 12) game.spawnParticle(P.pos.x, P.pos.y + 0.1, P.pos.z, -P.vel.x * 0.1, 0.8, -P.vel.z * 0.1, 0xe0f4ff, 0.18, 0.4, 3);
        // dans la neige poudreuse : de petites bouffées
        else if (sp > 6 && Math.random() < dt * 5) game.spawnParticle(P.pos.x - Math.sin(P.yaw) * 0.5, P.pos.y + 0.1, P.pos.z - Math.cos(P.yaw) * 0.5, (Math.random() - 0.5), 0.9, (Math.random() - 0.5), 0xffffff, 0.3, 0.5, 2);
      }
      // boules de neige (chez les amis, on prolonge la trajectoire reçue)
      if (game.guest) for (const b of st.sb) { b.vy -= 14 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; }
      for (let i = 0; i < SB_MAX; i++) {
        const b = st.sb[i];
        if (b) { const k2 = b.big ? 2 : 1; m4.compose(v.set(b.x, b.y, b.z), q.identity(), (this._sv || (this._sv = new THREE.Vector3())).set(k2, k2, k2)); }
        else m4.compose(v.set(0, -500, 0), q.identity(), zero);
        balls.setMatrixAt(i, m4);
      }
      balls.instanceMatrix.needsUpdate = true;
      // chats qui lancent : petit bond
      for (const c of game.cats) if (!c.dead && c.throwAnim && t - c.throwAnim < 0.35) { const a = (t - c.throwAnim) / 0.35; c.mesh.position.y += Math.sin(a * Math.PI) * 0.35; c.mesh.userData.head.rotation.x = -Math.sin(a * Math.PI) * 0.4; }
      // bonnets
      for (const b of bonnets) {
        const got = k.bonnets.includes(b.def.id);
        b.g.visible = !got;
        if (!got) { b.g.position.y = b.def.y + 0.8 + Math.sin(t * 2.5 + b.def.x) * 0.15; b.g.rotation.y = t * 1.6; }
      }
      // habitants
      for (const id in folks) {
        const f = folks[id], u = f.m.userData, d = f.def;
        const dd = Math.hypot(me.pos.x - d.x, me.pos.z - d.z);
        const look = dd < 8 ? Math.atan2(me.pos.x - d.x, me.pos.z - d.z) : d.yaw;
        f.m.rotation.y = lerpAngle(f.m.rotation.y, look, Math.min(1, dt * 3));
        if (u.mtail) u.mtail.rotation.y = Math.sin(t * 7 + d.x) * 0.5;
        if (u.mhead) u.mhead.rotation.x = Math.sin(t * 2 + d.z) * 0.06;
        f.mark.visible = save().intro && (id === 'bernard' ? !k.metBernard : !k.metMyrtille);
        f.mark.position.set(d.x, d.y + (u.height || 1.6) + 1.2 + Math.sin(t * 4) * 0.1, d.z);
      }
      // cheminées qui fument, tasses qui fument
      if (Math.random() < dt * 6) {
        const c = chimneys[Math.floor(Math.random() * chimneys.length)];
        if (Math.hypot(c.x - cam.x, c.z - cam.z) < 90) game.spawnParticle(c.x + (Math.random() - 0.5) * 0.2, c.y, c.z + (Math.random() - 0.5) * 0.2, 0.3 + Math.random() * 0.3, c.mug ? 0.5 : 1.0, (Math.random() - 0.5) * 0.3, c.mug ? 0xffffff : 0xd8dce4, c.mug ? 0.14 : 0.55, c.mug ? 1.2 : 2.6, -0.15);
      }
      for (const l of treeLights) if (l.isMesh && l.material.emissiveIntensity !== undefined) l.material.emissiveIntensity = 0.7 + Math.sin(t * 3) * 0.25;
      // drapeaux
      flags.forEach((f, i) => {
        const up = k.flags.includes(f.def.id) || f.def.id === 0 ? 1 : 0;
        f.raise += (up - f.raise) * Math.min(1, dt * 3);
        f.cloth.position.y = 1.0 + f.raise * 2.3;
        f.cloth.material.color.setHex(up ? 0xffffff : 0x9a9a9a);
        if (Math.hypot(f.def.x - cam.x, f.def.z - cam.z) < 60) {
          const arr = f.cloth.geometry.attributes.position.array;
          for (let j = 0; j < arr.length; j += 3) { const x = f.base[j]; arr[j + 2] = Math.sin(x * 3 - t * 6 + i) * 0.12 * x; }
          f.cloth.geometry.attributes.position.needsUpdate = true;
        }
        const since = t - f.raisedAt;
        f.halo.material.opacity = since < 1.5 ? (1 - since / 1.5) * 0.8 : (f.def.id === st.cp ? 0.22 + Math.sin(t * 3) * 0.08 : 0);
        f.halo.scale.setScalar(since < 1.5 ? 1 + since * 2 : 1);
      });
      if (fortFlag) { const arr = fortFlag.geometry.attributes.position.array, base = fortFlag.userData.base; for (let j = 0; j < arr.length; j += 3) arr[j + 2] = Math.sin(base[j] * 3 - t * 5) * 0.12 * base[j]; fortFlag.geometry.attributes.position.needsUpdate = true; }
      // la Capitaine
      cap.visible = !(B.inv > 0 && Math.floor(t * 14) % 2 === 0);
      cap.position.set(B.x, B.y, B.z); cap.rotation.y = B.yaw;
      const cu = cap.userData, tired = B.phase === 'tired';
      if (cu.stars) { cu.stars.visible = tired; if (tired) cu.stars.children.forEach((s, i) => { const a = t * 4 + i * Math.PI / 2; s.position.set(Math.cos(a) * 0.45, Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.45); }); }
      if (cu.head) { cu.head.rotation.z = tired ? Math.sin(t * 3) * 0.25 : B.phase === 'friend' ? Math.sin(t * 1.5) * 0.1 : 0; cu.head.rotation.x = B.phase === 'throw' && B.t < 0.3 ? -0.3 : 0; }
      if (cu.tail) cu.tail.rotation.x = -0.3 + Math.sin(t * 5) * 0.3;
      if (cu.legs) cu.legs.forEach((l, i) => { l.rotation.x = B.phase === 'hop' ? (i < 2 ? -0.8 : 0.8) : tired ? 0.5 : Math.sin(t * 2 + i) * 0.05; });
      if (tired) cap.position.y -= 0.15;
      game.placeShadow(capShadow, cap.position, 1.0); capShadow.visible = cap.visible;
    },
  };

  // état initial d'après la sauvegarde
  logic.applySave();
  return logic;
}
