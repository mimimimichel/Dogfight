/*
 * Matcha & Ainu — Niveau 6 « La Plage aux Coquillages » : le décor.
 * Sable (relief de level6.js), mer et rouleaux qui viennent mourir sur la plage,
 * dunes, cabines, parasols, palmiers, ponton, rochers aux flaques, fort de sable,
 * falaise et phare. Les règles du jeu (creuser, bodyboard, crabes, phoque…) sont
 * dans beachplay.js. Le moteur commun est dans game.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as W from './world.js';
import * as RT from './realtex.js';
import * as K from './citykit.js';
import { buildCaptain } from './forest.js';
import { buildPlay } from './beachplay.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
function hash2(x, z) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/** Ajoute une couleur (fixe ou calculée) à une géométrie non indexée. */
export function paint(geo, color) {
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
/** Comme M.mergeGeos, mais garde les coordonnées de texture (feuilles de palmier). */
function mergeUV(list) {
  const geos = list.map(({ geo, x, y, z, rx, ry, rz }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(1, 1, 1)));
    return g;
  });
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const out = new THREE.BufferGeometry();
  for (const [k, sz] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) {
    const a = new Float32Array(n * sz);
    let o = 0;
    for (const g of geos) { a.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(a, sz));
  }
  return out;
}
const vmat = (opts) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.85 }, opts || {}));

/** Bloc de grès bon marché (peu de faces, facettes), pour habiller les falaises. */
function sandstoneRock(seed, rx, ry, rz, lite) {
  const g = new THREE.IcosahedronGeometry(1, lite ? 2 : 3);
  const p = g.attributes.position, o = seed * 7.13;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + (vnoise(x * 1.7 + o, z * 1.7 + y * 1.3) - 0.5) * 0.45 + (vnoise(x * 4.1 + o, y * 4.1 - z) - 0.5) * 0.16;
    let yy = y * k;
    if (yy > 0.55) yy = 0.55 + (yy - 0.55) * 0.3;                 // dessus un peu plat
    p.setXYZ(i, x * k * rx, yy * ry, z * k * rz);
  }
  g.computeVertexNormals();
  return paint(g, (c, x, y, z) => { const n = vnoise(x * 0.8 + o, z * 0.8 + y); c.set(0xd8b88a).lerp(new THREE.Color(0xa88a68), n * 0.6 + (y < 0 ? 0.2 : 0)); });
}

/** Coquillage (Saint-Jacques) : l'objet à collectionner, debout comme une pièce. */
export function shellGeometry() {
  const s = new THREE.Shape();
  const N = 28;
  s.moveTo(-0.07, -0.16);
  s.lineTo(-0.12, -0.2); s.lineTo(-0.14, -0.13);                   // petite oreille gauche
  for (let i = 0; i <= N; i++) {
    const a = -1.15 + (i / N) * 2.3;
    const r = 0.3 + 0.022 * Math.cos(a * 15);
    s.lineTo(Math.sin(a) * r, -0.16 + Math.cos(a) * r);
  }
  s.lineTo(0.14, -0.13); s.lineTo(0.12, -0.2); s.lineTo(0.07, -0.16);
  s.lineTo(-0.07, -0.16);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.02, bevelSegments: 2, curveSegments: 4 });
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i) + 0.16, z = p.getZ(i);
    if (z > 0.03) {
      const a = Math.atan2(x, y), d = Math.hypot(x, y);
      p.setZ(i, z + 0.05 * Math.sin(Math.min(1, d / 0.3) * Math.PI) + 0.014 * Math.cos(a * 15) * Math.min(1, d / 0.12));
    }
  }
  g.computeVertexNormals();
  g.center();
  return g;
}

// ---------------------------------------------------------------------------
// Textures dessinées
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
/** Grain de sable (presque blanc : la couleur vient des sommets) et petites rides du vent. */
function sandTextures(real) {
  if (real) {
    return RT.realTex(512, 512, 61, (x, y, w, h, r) => {
      x.fillStyle = '#f2ece2'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 26000; i++) {
        const v = 200 + Math.floor(r() * 55), px = r() * w, py = r() * h;
        x.fillStyle = `rgba(${v},${v - 8},${v - 22},0.5)`; x.fillRect(px, py, 1.4, 1.4);
      }
      for (let i = 0; i < 900; i++) { x.fillStyle = r() < 0.5 ? 'rgba(120,96,70,0.35)' : 'rgba(255,255,255,0.6)'; x.fillRect(r() * w, r() * h, 1.6, 1.6); }
      // rides : bandes sombres et claires ondulées (et le relief qui va avec)
      for (let row = 0; row < h; row += 2) {
        for (let col = 0; col < w; col += 4) {
          const k = Math.sin((row + Math.sin(col * 0.035) * 9) * 0.19);
          y.fillStyle = `rgba(${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${k > 0 ? 255 : 0},${Math.abs(k) * 0.22})`;
          y.fillRect(col, row, 4, 2);
        }
      }
      for (let i = 0; i < 9000; i++) { const v = Math.floor(r() * 255); y.fillStyle = `rgba(${v},${v},${v},0.5)`; y.fillRect(r() * w, r() * h, 1.5, 1.5); }
    }, { strength: 2.2 });
  }
  const map = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#f6f2ea'; x.fillRect(0, 0, w, h);
    const r = rng(17);
    for (let i = 0; i < 1400; i++) { const v = 205 + Math.floor(r() * 50); x.fillStyle = `rgb(${v},${v - 6},${v - 18})`; x.fillRect(r() * w, r() * h, 1.5, 1.5); }
  }, true);
  return { map, normalMap: null };
}
function stripeTex(a, b, n, vertical) {
  return canvasTex(128, 128, (x, w, h) => {
    for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; if (vertical) x.fillRect(i * w / n, 0, w / n + 1, h); else x.fillRect(0, i * h / n, w, h / n + 1); }
  });
}
function woodTex() {
  return canvasTex(128, 256, (x, w, h) => {
    const r = rng(23);
    x.fillStyle = '#b88a5a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i++) {
      x.fillStyle = `rgb(${170 + Math.floor(r() * 30)},${125 + Math.floor(r() * 25)},${78 + Math.floor(r() * 20)})`;
      x.fillRect(i * 16 + 1, 0, 14, h);
      x.fillStyle = 'rgba(70,45,20,0.18)';
      for (let k = 0; k < 6; k++) x.fillRect(i * 16 + 2 + r() * 10, r() * h, 1, 20 + r() * 50);
    }
    x.fillStyle = 'rgba(60,36,16,0.55)';
    for (let i = 0; i <= 8; i++) x.fillRect(i * 16, 0, 1.5, h);
  }, true);
}
/** Feuille de palmier (penne) : nervure centrale et folioles, sur fond transparent. */
function frondTex() {
  return canvasTex(64, 256, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    x.strokeStyle = '#ffffff'; x.lineCap = 'round';
    for (let i = 0; i < 34; i++) {
      const y = 10 + i * 7, len = 28 * Math.sin(Math.min(1, (i + 2) / 30) * Math.PI) + 3;
      x.lineWidth = 4;
      x.beginPath(); x.moveTo(w / 2, y); x.lineTo(w / 2 - len, y + 10); x.stroke();
      x.beginPath(); x.moveTo(w / 2, y); x.lineTo(w / 2 + len, y + 10); x.stroke();
    }
    x.lineWidth = 4; x.beginPath(); x.moveTo(w / 2, 0); x.lineTo(w / 2, h); x.stroke();
  });
}
function pawFlagTex() {
  return canvasTex(128, 64, (x) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#2aa0e0'; x.fillRect(0, 0, 128, 10); x.fillRect(0, 54, 128, 10);
    x.beginPath(); x.ellipse(64, 38, 11, 9, 0, 0, 7); x.fill();
    for (const [px, py] of [[48, 26], [57, 19], [71, 19], [80, 26]]) { x.beginPath(); x.ellipse(px, py, 4.5, 5.5, 0, 0, 7); x.fill(); }
  });
}
function catFlagTex() {
  return canvasTex(128, 64, (x) => {
    x.fillStyle = '#2a2a3a'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#ffd23a';
    x.beginPath(); x.ellipse(64, 34, 16, 14, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(50, 26); x.lineTo(52, 10); x.lineTo(60, 22); x.fill();
    x.beginPath(); x.moveTo(78, 26); x.lineTo(76, 10); x.lineTo(68, 22); x.fill();
    x.fillStyle = '#2a2a3a'; x.fillRect(56, 30, 4, 4); x.fillRect(68, 30, 4, 4);
  });
}

// ---------------------------------------------------------------------------
export function buildBeach(game) {
  const decor = buildDecor(game);
  return buildPlay(game, decor);
}

function buildDecor(game) {
  const sc = game.scene, S = L, lite = game.lite, real = W.LOOK.real;
  const moving = [], chars = [];
  const shadowy = (o) => { o.traverse(k => { if (k.isMesh) { k.castShadow = true; k.receiveShadow = true; } }); return o; };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();
  // grand monde : le décor est rangé par tuiles de 64 m, cachées quand elles sont loin de la caméra
  const cull = [], TILE = 64;
  const tiled = (list, mat, opts) => {
    opts = opts || {};
    const buckets = new Map();
    for (const it of list) { const k = Math.floor(it.x / TILE) + ',' + Math.floor(it.z / TILE); if (!buckets.has(k)) buckets.set(k, []); buckets.get(k).push(it); }
    for (const [k, items] of buckets) {
      const [i, j] = k.split(',').map(Number);
      const mesh = new THREE.Mesh(opts.uv ? mergeUV(items) : M.mergeGeos(items), mat);
      mesh.castShadow = opts.cast !== false; mesh.receiveShadow = true;
      if (opts.depth) mesh.customDepthMaterial = opts.depth;
      if (opts.noOutline) mesh.userData.noOutline = true;
      sc.add(mesh);
      cull.push({ obj: mesh, x: (i + 0.5) * TILE, z: (j + 0.5) * TILE, r: TILE * 0.75, far: opts.far });
    }
  };
  const place = (obj, x, z, r, far) => { sc.add(obj); cull.push({ obj, x, z, r: r || 10, far }); return obj; };

  // --- Le sable --------------------------------------------------------------------
  {
    const size = S.HALF * 2, seg = lite ? 210 : 320;
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, S.heightAt(pos.getX(i), pos.getZ(i)));
    geo.computeVertexNormals();
    const nrm = geo.attributes.normal, col = new Float32Array(pos.count * 3);
    const DRY = new THREE.Color(0xf2dcaa), DUNE = new THREE.Color(0xf6e6c0), WET = new THREE.Color(0xc9a46e), UNDER = new THREE.Color(0xd6c08c),
      DEEP = new THREE.Color(0x7aa8a0), ROCK = new THREE.Color(0x9a918a), ROCK2 = new THREE.Color(0x7a6e66), GRASS = new THREE.Color(0x6ab24a),
      GRASS2 = new THREE.Color(0x8ac458), CLIFFS = [0xe2c69a, 0xcfae80, 0xe8d0a8, 0xc49e72, 0xdab88a], PROM = new THREE.Color(0xe8dcc4), c = new THREE.Color(), t = new THREE.Color();
    if (real) { GRASS.set(0x5a9a3a); GRASS2.set(0x7aa848); }
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nrm.getY(i);
      const u = S.fromShore(x, z), n = vnoise(x * 0.18, z * 0.18), n2 = vnoise(x * 0.9 + 5, z * 0.9);
      c.copy(DRY).lerp(DUNE, smooth(24, 40, u) * 0.7).multiplyScalar(0.96 + n * 0.07);
      c.lerp(PROM, smooth(45, 49, u) * smooth(-28, -12, x) * (z < 171 ? 0.85 : 0));
      c.lerp(WET, (1 - smooth(0.2, 0.7, y)) * smooth(-1.5, -0.2, y));
      c.lerp(UNDER, 1 - smooth(-0.6, -0.1, y));
      c.lerp(DEEP, 1 - smooth(-6, -2.5, y));
      // rochers aux flaques
      const rocky = smooth(-92, -100, x) * smooth(-3, 0, u) * smooth(30, 22, u) * smooth(0.55, 0.75, y);
      c.lerp(t.copy(ROCK).lerp(ROCK2, n2), rocky);
      // herbe : falaise du phare, talus du sud, touffes des dunes
      const grassy = (x > S.HEAD.x0 + 1.4 && x < S.HEAD.x1 - 0.8 ? smooth(7, 9.5, y) : 0) + (z > 171.5 ? 1 : 0) + (Math.hypot(x - S.GROVE.x, z - S.GROVE.z) < S.GROVE.r * 0.85 ? 0.7 : 0);
      if (grassy) c.lerp(t.copy(GRASS).lerp(GRASS2, n), smooth(0.55, 0.8, ny));
      // faces de falaise : grès clair, en strates
      const band = Math.floor((y + vnoise(x * 0.3, z * 0.3) * 1.2) / 1.5);
      c.lerp(t.set(CLIFFS[((band % CLIFFS.length) + CLIFFS.length) % CLIFFS.length]).multiplyScalar(0.9 + n2 * 0.18), smooth(0.75, 0.45, ny) * (y > 0.6 ? 1 : 0));
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const st = sandTextures(real);
    st.map.repeat.set(size / 5, size / 5);
    if (st.normalMap) st.normalMap.repeat.set(size / 5, size / 5);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: st.map, normalMap: st.normalMap, roughness: 0.96 });
    if (st.normalMap) mat.normalScale.set(0.7, 0.7);
    const sand = new THREE.Mesh(geo, mat);
    sand.name = 'terrain'; sand.receiveShadow = true;
    sc.add(sand);
  }

  // --- La mer (le shader d'eau commun) et les rouleaux ---------------------------------
  game.water = W.buildWater(sc, sc.fog);
  const surfMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 } },
    vertexShader: `
      uniform float uTime;
      attribute float aU;
      varying float vU; varying vec2 vXZ;
      void main() {
        vec3 p = position;
        float ph = aU * 0.5 - uTime * 1.4;
        float fade = smoothstep(-17.0, -10.0, aU) * (1.0 - smoothstep(-2.5, 0.0, aU));
        p.y += 0.16 * sin(ph) * fade;
        vU = aU; vXZ = p.xz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: `
      uniform float uTime;
      varying float vU; varying vec2 vXZ;
      float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(h(i), h(i + vec2(1, 0)), f.x), mix(h(i + vec2(0, 1)), h(i + vec2(1, 1)), f.x), f.y); }
      void main() {
        float ph = vU * 0.5 - uTime * 1.4;
        float fade = smoothstep(-17.0, -10.0, vU);
        float nz = n(vXZ * 0.9 + vec2(uTime * 0.3, 0.0));
        // crêtes d'écume des rouleaux, qui se brisent en approchant du bord
        float crest = pow(max(0.0, sin(ph + nz * 0.8)), 14.0) * fade * smoothstep(-15.0, -4.0, vU) * (0.55 + 0.45 * nz);
        // l'écume du bord : elle monte et redescend sur le sable mouillé
        float swash = 0.5 + 0.5 * sin(uTime * 0.9 + vXZ.x * 0.05);
        float edge = smoothstep(-2.6, -0.6 + swash * 0.8, vU) * (1.0 - smoothstep(0.2 + swash * 0.6, 1.2 + swash * 0.6, vU));
        float lace = smoothstep(0.35, 0.75, n(vXZ * 2.4 - vec2(0.0, uTime * 0.6)));
        float a = max(crest, edge * (0.45 + 0.55 * lace));
        if (a < 0.02) discard;
        gl_FragColor = vec4(vec3(1.0), a * 0.9);
        #include <colorspace_fragment>
      }`,
  });
  {
    // un ruban le long de chaque rivage (la Grande Plage et les rochers, la Crique) et un anneau autour de l'île
    const posA = [], uA2 = [], idx = [];
    const ribbon = (n, nu, pt) => {
      const base = posA.length / 3;
      for (let j = 0; j <= nu; j++) for (let i = 0; i <= n; i++) { const u = -18 + 20 * j / nu, p = pt(i / n, u); posA.push(p[0], S.WATER_Y + 0.03, p[1]); uA2.push(u); }
      for (let j = 0; j < nu; j++) for (let i = 0; i < n; i++) { const a2 = base + j * (n + 1) + i, b = a2 + 1, c = a2 + n + 1, d = c + 1; idx.push(a2, c, b, b, c, d); }
    };
    const nu = lite ? 12 : 20;
    ribbon(lite ? 150 : 260, nu, (k, u) => { const x = -186 + (S.HEAD.x0 - 1 + 186) * k; return [x, S.shoreZ(x) + u]; });
    ribbon(lite ? 50 : 90, nu, (k, u) => { const x = S.HEAD.x1 + 1 + (187 - S.HEAD.x1 - 1) * k; return [x, S.shoreZ(x) + u]; });
    const I = S.ISLAND, rr = Math.sqrt(I.top / 0.0133);
    ribbon(lite ? 40 : 64, nu, (k, u) => { const a2 = k * Math.PI * 2, r = rr - u; return [I.x + Math.cos(a2) * r, I.z + Math.sin(a2) * r]; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(posA, 3));
    g.setAttribute('aU', new THREE.Float32BufferAttribute(uA2, 1));
    g.setIndex(idx);
    const surf = new THREE.Mesh(g, surfMat);
    surf.renderOrder = 3; surf.frustumCulled = false; surf.userData.noOutline = true;
    sc.add(surf);
  }

  // --- Rochers : ceux où l'on grimpe, et ceux qui habillent les falaises ----------------
  {
    const list = [];
    S.rocks.forEach((r, i) => {
      const g = W.rockGeometry(40 + i, r.r * 1.1, (r.h + 1.2) * 0.75, r.r * 1.1);
      const top = W.flattenRockTop(g, 0.3);
      list.push({ geo: g, x: r.x, y: r.top - top, z: r.z });
    });
    {
      const SR = S.SEAL_ROCK, g = W.rockGeometry(77, SR.r * 1.15, 3.6, SR.r * 1.1), top = W.flattenRockTop(g, 0.3);
      list.push({ geo: g, x: SR.x, y: SR.top - top, z: SR.z });
    }
    // galets au bord des flaques
    const r = rng(91);
    for (let x = -180; x < -100; x += 4.5) {
      const z = S.shoreZ(x) - 1.5 + r() * 2, s2 = 0.7 + r() * 0.8;
      list.push({ geo: W.rockGeometry(200 + Math.round(-x), s2 * (1 + r() * 0.4), s2 * (0.8 + r() * 0.5), s2), x, y: S.heightAt(x, z) - s2 * 0.25, z, ry: r() * 6 });
    }
    // la Grotte aux Flaques : un cirque de grands rochers, le promontoire, les rochers pour y grimper
    const caveList = [];
    S.caveRocks.forEach((c, i) => {
      const g = W.rockGeometry(600 + i, c.r * 1.25, (c.h + 1.5) * 0.62, c.r * 1.3);
      caveList.push({ geo: g, x: c.x, y: c.y + c.h * 0.35, z: c.z, ry: c.a });
    });
    for (const st of S.caveSteps.concat([Object.assign({ y: S.heightAt(S.CAVE_TOP.x, S.CAVE_TOP.z) }, S.CAVE_TOP)])) {
      const h = st.top - st.y, g = W.rockGeometry(700 + Math.round(h * 10), st.r * 1.15, (h + 1) * 0.62, st.r * 1.15), top = W.flattenRockTop(g, 0.25);
      caveList.push({ geo: g, x: st.x, y: st.top - top, z: st.z });
    }
    tiled(list.concat(caveList), W.rockMat(), { far: 260 });
    // les falaises : de gros blocs de grès incrustés dans la paroi (et au pied), pour casser le mur
    const cliffRocks = [];
    const face = (x0, z0, x1, z1, nx, nz, step) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / step);
      for (let i = 0; i <= n; i++) {
        const x = x0 + (x1 - x0) * i / n + (r() - 0.5) * 1.5, z = z0 + (z1 - z0) * i / n + (r() - 0.5) * 1.5;
        const top = S.heightAt(x - nx * 1.6, z - nz * 1.6), foot = S.heightAt(x + nx * 2.5, z + nz * 2.5);
        if (top - foot < 2) continue;
        for (let y = foot + 0.4; y < top - 1; y += 2.8 + r() * 1.5) {
          const sz = 1.8 + r() * 1.6;
          cliffRocks.push({ x: x + nx * (0.2 + r() * 0.6), y, z: z + nz * (0.2 + r() * 0.6), s: sz });
        }
      }
    };
    const st2 = lite ? 6.5 : 4.8, H = S.HEAD;
    face(-188.2, -60, -188.2, 172, 1, 0, st2);              // falaise de l'ouest
    face(188.8, -60, 188.8, 172, -1, 0, st2 * 1.4);         // falaise de l'est
    face(H.x0 + 0.6, H.z0, H.x0 + 0.6, 50, -1, 0, st2);     // la falaise du phare, côté Grande Plage
    face(H.x1 - 0.2, H.z0, H.x1 - 0.2, 50, 1, 0, st2);      // côté Crique
    face(H.x0, H.z0 - 0.3, H.x1, H.z0 - 0.3, 0, -1, st2);   // la pointe, côté mer
    face(-186, 173, 186, 173, 0, -1, st2 * 1.8);            // talus du sud
    const cr = cliffRocks.map((c, i) => ({ geo: sandstoneRock(500 + i, c.s * (1 + r() * 0.5), c.s * (0.7 + r() * 0.4), c.s, lite), x: c.x, y: c.y, z: c.z, ry: r() * 6 }));
    tiled(cr, vmat({ roughness: 0.95, flatShading: true }), { far: 300 });
    // quelques rochers sur l'Île aux Mouettes
    const isl = [];
    for (let k = 0; k < 5; k++) { const a = k * 1.3 + 0.4, d = 9 + (k % 2) * 3, x = S.ISLAND.x + Math.cos(a) * d, z = S.ISLAND.z + Math.sin(a) * d, s2 = 0.8 + (k % 3) * 0.4; isl.push({ geo: W.rockGeometry(900 + k, s2 * 1.3, s2, s2), x, y: S.heightAt(x, z) - s2 * 0.2, z }); }
    tiled(isl, W.rockMat(), { far: 300 });
    // flaques : de l'eau claire et brillante dans les creux
    const pm = new THREE.MeshStandardMaterial({ color: 0x6ad8e8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.78, emissive: 0x0a3a4a, emissiveIntensity: 0.3 });
    const glowPool = new THREE.MeshStandardMaterial({ color: 0x5ae8f0, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x1ab8d0, emissiveIntensity: 0.9 });
    for (const p of S.POOLS) {
      const inCave = Math.hypot(p.x - S.CAVE.x, p.z - S.CAVE.z) < S.CAVE.r;
      const d = new THREE.Mesh(new THREE.CircleGeometry(p.r * 0.92, 28), inCave ? glowPool : pm);
      d.rotation.x = -Math.PI / 2; d.position.set(p.x, S.heightAt(p.x, p.z) + 0.32, p.z); d.renderOrder = 2;
      d.userData.noOutline = true;
      place(d, p.x, p.z, p.r, 200);
    }
    // les flaques qui brillent dans la grotte, et des étoiles de mer collées aux rochers
    const stars = [];
    for (let k = 0; k < 7; k++) {
      const a = k * 0.9 + 0.7, d = S.CAVE.r * 0.55, x = S.CAVE.x + Math.cos(a) * d, z = S.CAVE.z + Math.sin(a) * d;
      const st = new THREE.CylinderGeometry(0.35, 0.35, 0.08, 5); stars.push({ geo: paint(st, [0xff7a4a, 0xff5a8a, 0xffb03a][k % 3]), x, y: S.heightAt(x, z) + 0.05, z, ry: k });
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.5 + (k % 3) * 0.2, 16), glowPool);
      glow.rotation.x = -Math.PI / 2; glow.position.set(x + 1.2, S.heightAt(x + 1.2, z + 0.8) + 0.06, z + 0.8); glow.userData.noOutline = true;
      place(glow, x, z, 2, 200);
    }
    tiled(stars, vmat({ roughness: 0.6 }), { cast: false });

  }

  // --- Le ponton et le bateau de Barnabé -----------------------------------------------
  {
    const P = S.PIER, wood = woodTex();
    wood.repeat.set(1, (P.z0 - P.z1) / 6);
    const plankMat = new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(P.w, 0.3, P.z0 - P.z1), plankMat);
    deck.position.set(P.x, P.top - 0.15, (P.z0 + P.z1) / 2);
    const endTex = woodTex(); endTex.repeat.set(2, 1);
    const end = new THREE.Mesh(new THREE.BoxGeometry(P.endW, 0.3, P.endD), new THREE.MeshStandardMaterial({ map: endTex, roughness: 0.85 }));
    end.position.set(P.x, P.top - 0.15, P.z1 - P.endD / 2);
    sc.add(shadowy(deck), shadowy(end));
    const posts = [];
    for (let z = P.z0 - 1; z > P.z1; z -= 4) posts.push([P.x - P.w / 2 + 0.2, z], [P.x + P.w / 2 - 0.2, z]);
    for (let x = P.x - P.endW / 2 + 0.3; x <= P.x + P.endW / 2; x += 3.1) posts.push([x, P.z1 - P.endD + 0.3]);
    const pi = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.22, 1, 8), M.mat(0x6a4a30, { roughness: 0.9 }), posts.length);
    posts.forEach(([x, z], i) => {
      const g = Math.min(P.top - 0.3, S.heightAt(x, z)), h = P.top + 0.6 - g;
      m4.compose(v.set(x, g + h / 2, z), q.identity(), sv.set(1, h, 1)); pi.setMatrixAt(i, m4);
    });
    pi.castShadow = true;
    sc.add(pi);
    // garde-corps de corde au bout du ponton
    const rail = new THREE.Mesh(new THREE.BoxGeometry(P.endW, 0.08, 0.08), M.mat(0xd8c49a));
    rail.position.set(P.x, P.top + 0.55, P.z1 - P.endD + 0.3); sc.add(rail);
    // bouées de sauvetage accrochées
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.11, 8, 18), new THREE.MeshStandardMaterial({ map: stripeTex('#e83a3a', '#ffffff', 8, true), roughness: 0.6 }));
    ring.position.set(P.x - P.w / 2 - 0.05, P.top + 0.25, P.z0 - 10); ring.rotation.y = Math.PI / 2; sc.add(ring);
  }
  const boat = K.buildBoat(0x2a6ab0);
  boat.position.set(S.BOAT.x, S.WATER_Y, S.BOAT.z); boat.rotation.y = S.BOAT.yaw;
  sc.add(boat); moving.push(boat);
  // voiliers au large (décor)
  const sails = [];
  {
    const sailMat = M.mat(0xfafaf4, { side: THREE.DoubleSide, roughness: 0.7 });
    for (const [x, z, c, s] of [[-70, -190, 0xe04848, 1.6], [60, -210, 0x3a8ae0, 1.9], [-160, -150, 0xf0b020, 1.4], [160, -160, 0x40b060, 1.6], [10, -170, 0xff7ab0, 1.3]]) {
      const g = new THREE.Group();
      const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 4.4, 10, 1, false, 0, Math.PI), M.mat(c));
      hull.rotation.set(Math.PI / 2, Math.PI / 2, 0); hull.scale.set(1, 1, 0.7);
      const sail = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.6, -1.2), new THREE.Vector3(0, 5, 0.3), new THREE.Vector3(0, 0.6, 1.4)]), sailMat);
      sail.geometry.computeVertexNormals();
      g.add(hull, sail); g.scale.setScalar(s); g.position.set(x, 0, z); g.rotation.y = 0.6 + x * 0.01;
      g.userData = { x, z, ph: x * 0.1 };
      sc.add(g); sails.push(g);
    }
  }

  // --- Le phare, sur la falaise -------------------------------------------------------
  const LH = S.LIGHTHOUSE;
  const lh = {};
  {
    const g = new THREE.Group();
    const bands = canvasTex(32, 256, (x) => { for (let i = 0; i < 7; i++) { x.fillStyle = i % 2 ? '#d83a3a' : '#fafafa'; x.fillRect(0, i * 256 / 7, 32, 256 / 7 + 1); } });
    const H = LH.top - 0.6 - LH.base;
    const body = new THREE.Mesh(new THREE.CylinderGeometry(LH.r * 0.8, LH.r, H + 1, 28), new THREE.MeshStandardMaterial({ map: bands, roughness: 0.55 }));
    body.position.y = H / 2 - 0.5;
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.9, 0.3), M.mat(0x3a5a8a)); door.position.set(0, 0.95, LH.r - 0.05);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.2), M.mat(0x2a3a4a)); win.position.set(0, H * 0.55, LH.r * 0.86);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(LH.capR, LH.capR, 0.6, 32), M.mat(0x2e3a48, { roughness: 0.5 })); gallery.position.y = LH.top - 0.3 - LH.base;
    const railPosts = [];
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; railPosts.push({ geo: new THREE.CylinderGeometry(0.04, 0.04, 0.9, 5), x: Math.cos(a) * (LH.capR - 0.1), y: LH.top + 0.45 - LH.base, z: Math.sin(a) * (LH.capR - 0.1) }); }
    const rails = new THREE.Mesh(M.mergeGeos(railPosts), M.mat(0x2e3a48));
    const railTop = new THREE.Mesh(new THREE.TorusGeometry(LH.capR - 0.1, 0.05, 6, 40), M.mat(0x2e3a48)); railTop.rotation.x = Math.PI / 2; railTop.position.y = LH.top + 0.9 - LH.base;
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.7, 16), new THREE.MeshStandardMaterial({ color: 0x8a8a7a, emissive: 0xffd060, emissiveIntensity: 0.0, roughness: 0.25, metalness: 0.2 }));
    lamp.position.y = LH.top + 0.85 - LH.base;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.2, 16), M.mat(0xd83a3a, { roughness: 0.5 })); cap.position.y = LH.top + 2.3 - LH.base;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), M.GOLD()); knob.position.y = LH.top + 3.0 - LH.base;
    g.add(body, door, win, gallery, rails, railTop, lamp, cap, knob);
    // l'escalier extérieur (marches de pierre accrochées au phare)
    const stepGeos = [];
    for (const s of S.lighthouseSteps) {
      stepGeos.push({ geo: new THREE.CylinderGeometry(s.r, s.r * 0.9, 0.35, 14), x: s.x - LH.x, y: s.top - 0.175 - LH.base, z: s.z - LH.z });
      const arm = new THREE.BoxGeometry(0.22, 0.22, 2.2); arm.rotateY(Math.atan2(s.x - LH.x, s.z - LH.z));
      stepGeos.push({ geo: arm, x: (s.x - LH.x) / 2, y: s.top - 0.45 - LH.base, z: (s.z - LH.z) / 2 });
    }
    g.add(new THREE.Mesh(M.mergeGeos(stepGeos), M.mat(0xb8a890, { roughness: 0.9 })));
    g.position.set(LH.x, LH.base, LH.z);
    sc.add(shadowy(g));
    lamp.castShadow = false;
    // le faisceau (quand il est rallumé) et le halo
    const beamGeo = new THREE.ConeGeometry(2.4, 40, 20, 1, true); beamGeo.translate(0, -20, 0); beamGeo.rotateZ(Math.PI / 2);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false }));
    beam.position.set(LH.x, LH.top + 0.9, LH.z); beam.userData.noOutline = true; beam.renderOrder = 4;
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0xfff0a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.scale.set(9, 9, 1); halo.position.set(LH.x, LH.top + 0.9, LH.z); halo.userData.noOutline = true;
    sc.add(beam, halo); moving.push(beam);
    Object.assign(lh, { lamp, beam, halo, group: g });
  }

  // --- Le Fort de Sable ---------------------------------------------------------------
  const fort = {};
  {
    const sandMat = vmat({ roughness: 1 });
    const geos = [];
    const sandCol = (c, x, y) => c.set(0xe8cc92).multiplyScalar(0.92 + hash2(Math.floor(x * 6), Math.floor(y * 6)) * 0.12);
    const tower = (x, y, z, r, h, big) => {
      const g = new THREE.CylinderGeometry(r * 0.9, r * 1.08, h, big ? 18 : 14, 3);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getY(i) * 5 + Math.atan2(p.getZ(i), p.getX(i)) * 3) * 0.03; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
      g.computeVertexNormals();
      geos.push({ geo: paint(g, sandCol), x, y: y + h / 2, z });
      // créneaux
      const n = big ? 7 : 5;
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2;
        geos.push({ geo: paint(new THREE.BoxGeometry(r * 0.42, 0.36, r * 0.42), sandCol), x: x + Math.cos(a) * r * 0.72, y: y + h + 0.16, z: z + Math.sin(a) * r * 0.72, ry: -a });
      }
    };
    for (const t of S.fortTowers) tower(t.x, t.y - 0.4, t.z, t.r, t.h + 0.4, t.big);
    tower(S.KEEP.x, S.KEEP.y - 0.4, S.KEEP.z, S.KEEP.r, S.KEEP.top - S.KEEP.y + 0.4, true);
    // le chemin de ronde (les murets entre les tours)
    for (let i = 0; i < S.fortTowers.length; i++) {
      const a = S.fortTowers[i], b = S.fortTowers[(i + 1) % S.fortTowers.length];
      const d = Math.hypot(b.x - a.x, b.z - a.z);
      if (d > 4.5) continue;                                   // la porte
      const wall = new THREE.BoxGeometry(0.9, 1.25, d);
      geos.push({ geo: paint(wall, sandCol), x: (a.x + b.x) / 2, y: Math.min(a.y, b.y) + 0.45, z: (a.z + b.z) / 2, ry: Math.atan2(b.x - a.x, b.z - a.z) });
    }
    const fm = new THREE.Mesh(M.mergeGeos(geos), sandMat);
    fm.castShadow = fm.receiveShadow = true;
    sc.add(fm);
    // drapeaux des chats sur les grandes tours
    const fTex = catFlagTex(), flags = [];
    for (const t of S.fortTowers.filter(q => q.big && !S.FORT_FLAGS.some(f => Math.hypot(f.x - q.x, f.z - q.z) < 0.1)).concat([{ x: S.KEEP.x, z: S.KEEP.z, y: S.KEEP.y, h: S.KEEP.top - S.KEEP.y }])) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.6, 5), M.mat(0x6a4a30)); pole.position.set(t.x, t.y + t.h + 0.8, t.z);
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.5, 6, 1), new THREE.MeshStandardMaterial({ map: fTex, side: THREE.DoubleSide, roughness: 0.8 }));
      cloth.geometry.translate(0.45, 0, 0); cloth.position.set(t.x + 0.04, t.y + t.h + 1.35, t.z);
      cloth.userData.base = cloth.geometry.attributes.position.array.slice();
      sc.add(pole, cloth); flags.push(cloth);
    }
    // seaux et pelles (décor, dans le fort)
    const toys = [];
    [[2.5, 2.5, 0xe04848], [-3, 1.5, 0x3a8ae0], [1, -3.2, 0xf0b020]].forEach(([dx, dz, c]) => {
      toys.push({ geo: paint(new THREE.CylinderGeometry(0.28, 0.22, 0.45, 12), c), x: S.FORT.x + dx, y: S.heightAt(S.FORT.x + dx, S.FORT.z + dz) + 0.22, z: S.FORT.z + dz });
    });
    sc.add(new THREE.Mesh(M.mergeGeos(toys), vmat({ roughness: 0.5 })));
    // la Capitaine Moustache, sur la grande tour du nord
    const cap = buildCaptain(); cap.scale.setScalar(1.25);
    cap.position.set(S.KEEP.x, S.KEEP.top, S.KEEP.z); cap.rotation.y = 0;
    sc.add(cap); chars.push(cap); moving.push(cap);
    Object.assign(fort, { flags, cap, flagTex: fTex });
  }

  // --- Palmiers -----------------------------------------------------------------------
  {
    const trunkGeos = [], frondGeos = [], nutGeos = [];
    const ringed = (c, x, y) => c.set(0x9a7a52).multiplyScalar(0.85 + 0.2 * (Math.sin(y * 9) * 0.5 + 0.5));
    const frond = (len) => {
      const seg = 6, g = new THREE.PlaneGeometry(1.3, len, 1, seg);
      g.translate(0, len / 2, 0);
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = y / len; p.setZ(i, -k * k * len * 0.55); p.setX(i, p.getX(i) * (0.5 + Math.sin(k * Math.PI) * 0.7)); }
      g.rotateX(-Math.PI / 2 + 0.55);
      return g;
    };
    S.palms.forEach((pl, pi) => {
      // tronc courbé : une suite de tronçons
      const n = 8, segH = pl.h / n;
      let x = 0, y = 0, z = 0;
      const dirA = pl.rot;
      for (let i = 0; i < n; i++) {
        const k = i / n, lean = pl.lean * (1 + k * 1.6);
        const g = new THREE.CylinderGeometry(0.26 - k * 0.07, 0.3 - k * 0.07, segH * 1.06, 9, 2);
        g.rotateZ(-lean); g.rotateY(dirA);
        trunkGeos.push({ geo: paint(g, ringed), x: pl.x + x, y: pl.y + y + segH / 2, z: pl.z + z });
        x += Math.cos(dirA) * Math.sin(lean) * segH; z -= Math.sin(dirA) * Math.sin(lean) * segH; y += Math.cos(lean) * segH;
      }
      const top = [pl.x + x, pl.y + y, pl.z + z];
      pl.topX = top[0]; pl.topY = top[1]; pl.topZ = top[2];
      const r = rng(300 + pi), nf = lite ? 7 : 9;
      for (let i = 0; i < nf; i++) {
        const g = frond(2.6 + r() * 0.9);
        g.rotateY(i / nf * Math.PI * 2 + r() * 0.3);
        frondGeos.push({ geo: paint(g, (c) => c.setHSL(0.27 + r() * 0.04, 0.55, real ? 0.32 : 0.42)), x: top[0], y: top[1] - 0.05, z: top[2] });
      }
      for (let i = 0; i < 3; i++) { const a = i * 2.1; nutGeos.push({ geo: paint(new THREE.SphereGeometry(0.17, 8, 6), 0x6a4a28), x: top[0] + Math.cos(a) * 0.25, y: top[1] - 0.25, z: top[2] + Math.sin(a) * 0.25 }); }
    });
    tiled(trunkGeos.concat(nutGeos), vmat({ roughness: 0.9 }));
    const fm = new THREE.MeshStandardMaterial({ vertexColors: true, map: frondTex(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75 });
    tiled(frondGeos, fm, { uv: true, depth: new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: fm.map, alphaTest: 0.4 }) });
  }

  // --- Parasols, serviettes, cabines --------------------------------------------------
  {
    const n = S.PARASOLS.length;
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 6), M.mat(0xf4f4f4), n);
    const topGeo = new THREE.ConeGeometry(1.5, 0.6, 12, 1, true); topGeo.translate(0, 0, 0);
    const tops = new THREE.InstancedMesh(topGeo, new THREE.MeshStandardMaterial({ map: stripeTex('#ffffff', '#c8c8c8', 12, true), roughness: 0.65, side: THREE.DoubleSide }), n);
    const towels = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.03, 1.9), new THREE.MeshStandardMaterial({ map: stripeTex('#ffffff', '#dcdcdc', 6, false), roughness: 0.9 }), n);
    const c = new THREE.Color();
    S.PARASOLS.forEach((p, i) => {
      const tilt = 0.12;
      q.setFromEuler(e.set(tilt * Math.cos(p.rot), 0, tilt * Math.sin(p.rot)));
      m4.compose(v.set(p.x, p.y + 1.15, p.z), q, sv.set(1, 1, 1)); poles.setMatrixAt(i, m4);
      m4.compose(v.set(p.x + Math.sin(p.rot) * 0.14, p.y + 2.5, p.z - Math.cos(p.rot) * 0.14), q, sv.set(1, 1, 1)); tops.setMatrixAt(i, m4); tops.setColorAt(i, c.set(p.color));
      const tx = p.x + Math.cos(p.rot) * 1.2, tz = p.z + Math.sin(p.rot) * 1.2;
      m4.compose(v.set(tx, S.heightAt(tx, tz) + 0.03, tz), q.setFromEuler(e.set(0, p.rot, 0)), sv.set(1, 1, 1)); towels.setMatrixAt(i, m4);
      towels.setColorAt(i, c.set([0xff7ab0, 0x3ac0c0, 0xf0b020, 0x7ad83a, 0xe04848][i % 5]));
    });
    tops.castShadow = poles.castShadow = true; towels.receiveShadow = true;
    sc.add(poles, tops, towels);
    // cabines rayées
    const hutGeos = [];
    for (const h of S.huts) {
      hutGeos.push({ geo: paint(new THREE.BoxGeometry(2.6, 2.6, 2.2), h.color), x: h.x, y: h.y + 1.3, z: h.z });
      // rayures blanches (des lattes posées sur les murs)
      for (let k = -1.05; k <= 1.06; k += 0.7) {
        hutGeos.push({ geo: paint(new THREE.BoxGeometry(0.32, 2.5, 2.26), 0xffffff), x: h.x + k, y: h.y + 1.3, z: h.z });
        if (Math.abs(k) < 1) hutGeos.push({ geo: paint(new THREE.BoxGeometry(2.66, 2.5, 0.32), 0xffffff), x: h.x, y: h.y + 1.3, z: h.z + k * 0.8 });
      }
      const roof = new THREE.CylinderGeometry(0.01, 2.1, 1.0, 4, 1); roof.rotateY(Math.PI / 4);
      hutGeos.push({ geo: paint(roof, h.color), x: h.x, y: h.y + 3.1, z: h.z, sx: 1.05, sz: 0.95 });
      const door = new THREE.BoxGeometry(1.0, 1.8, 0.08);
      hutGeos.push({ geo: paint(door, 0xf6eedc), x: h.x, y: h.y + 0.95, z: h.z - 1.12 });
    }
    // les maisons du village : murs colorés, toit, porte, fenêtres et volets
    for (const h of S.houses) {
      const ca = Math.cos(h.rot), sa = Math.sin(h.rot), P = (dx, dz) => ({ x: h.x + ca * dx + sa * dz, z: h.z - sa * dx + ca * dz });
      hutGeos.push({ geo: paint(new THREE.BoxGeometry(h.w, 4.2, h.d), h.color), x: h.x, y: h.y + 2.1, z: h.z, ry: h.rot });
      const roof = new THREE.CylinderGeometry(0.01, 1, 1, 4, 1); roof.rotateY(Math.PI / 4); roof.scale(h.w * 0.78, 2.2, h.d * 0.78);
      hutGeos.push({ geo: paint(roof, h.roof), x: h.x, y: h.y + 5.3, z: h.z, ry: h.rot });
      for (const sd of [-1, 1]) {
        const door = P(0, sd * (h.d / 2 + 0.03));
        if (sd < 0) hutGeos.push({ geo: paint(new THREE.BoxGeometry(1.2, 2.2, 0.08), 0x8a5a30), x: door.x, y: h.y + 1.1, z: door.z, ry: h.rot });
        for (const wx of [-2.2, 2.2]) {
          const wp = P(wx, sd * (h.d / 2 + 0.03));
          hutGeos.push({ geo: paint(new THREE.BoxGeometry(1.1, 1.1, 0.08), 0x4a7ab0), x: wp.x, y: h.y + 2.4, z: wp.z, ry: h.rot });
          for (const vx of [-0.75, 0.75]) { const vp = P(wx + vx, sd * (h.d / 2 + 0.05)); hutGeos.push({ geo: paint(new THREE.BoxGeometry(0.4, 1.2, 0.06), h.roof), x: vp.x, y: h.y + 2.4, z: vp.z, ry: h.rot }); }
        }
      }
    }
    // le glacier de Gino : un comptoir, un parasol rayé et un grand cornet
    {
      const I = S.ICECREAM;
      hutGeos.push({ geo: paint(new THREE.BoxGeometry(3.2, 1.1, 1.4), 0xffffff), x: I.x, y: I.y + 0.55, z: I.z + 1.4 });
      hutGeos.push({ geo: paint(new THREE.BoxGeometry(3.3, 0.12, 1.5), 0xff7ab0), x: I.x, y: I.y + 1.15, z: I.z + 1.4 });
      for (let k = 0; k < 5; k++) hutGeos.push({ geo: paint(new THREE.SphereGeometry(0.2, 10, 8), [0xff9ac8, 0xfff0c0, 0x8a5a30, 0x9ae0a0, 0xffd23a][k]), x: I.x - 1.2 + k * 0.6, y: I.y + 1.3, z: I.z + 1.4 });
      const cone = new THREE.ConeGeometry(0.55, 1.6, 12); cone.rotateX(Math.PI);
      hutGeos.push({ geo: paint(cone, 0xe0a050), x: I.x - 1.9, y: I.y + 2.6, z: I.z + 2.2 });
      hutGeos.push({ geo: paint(new THREE.SphereGeometry(0.6, 14, 10), 0xff9ac8), x: I.x - 1.9, y: I.y + 3.6, z: I.z + 2.2 });
      hutGeos.push({ geo: paint(new THREE.CylinderGeometry(0.08, 0.08, 2.4, 6), 0xdddddd), x: I.x - 1.9, y: I.y + 1.2, z: I.z + 2.2 });
      const umb = new THREE.ConeGeometry(2.2, 0.8, 12, 1, true);
      hutGeos.push({ geo: paint(umb, (cc, x, y, z) => cc.set(Math.floor((Math.atan2(z, x) + 3.2) * 12 / 6.28) % 2 ? 0xffffff : 0xff7ab0)), x: I.x + 0.6, y: I.y + 3.1, z: I.z + 2.0 });
      hutGeos.push({ geo: paint(new THREE.CylinderGeometry(0.06, 0.06, 3, 6), 0xdddddd), x: I.x + 0.6, y: I.y + 1.5, z: I.z + 2.0 });
    }
    // le chamboule-tout : un comptoir rayé, un auvent, des fanions
    {
      const C = S.CANS;
      hutGeos.push({ geo: paint(new THREE.BoxGeometry(5, 1.0, 1.0), (cc, x) => cc.set(Math.floor(x * 1.2 + 9) % 2 ? 0xe04848 : 0xffffff)), x: C.x, y: C.y + 0.5, z: C.z - 1.6 });
      hutGeos.push({ geo: paint(new THREE.BoxGeometry(5.6, 0.15, 2.4), 0x3a8ae0), x: C.x, y: C.y + 3.2, z: C.z - 2.2 });
      for (const sx of [-2.6, 2.6]) hutGeos.push({ geo: paint(new THREE.CylinderGeometry(0.08, 0.08, 3.2, 6), 0xffffff), x: C.x + sx, y: C.y + 1.6, z: C.z - 1.2 });
      hutGeos.push({ geo: paint(new THREE.BoxGeometry(5, 2.6, 0.12), 0xf6e8c8), x: C.x, y: C.y + 1.3, z: C.z - 3.3 });
    }
    // guirlande de fanions au-dessus de la place
    {
      const V = S.VILLAGE, cols = [0xe04848, 0xffd23a, 0x3a8ae0, 0x40b060, 0xff7ab0];
      for (const [ax, az, bx, bz] of [[V.x - 12, V.z - 10, V.x + 12, V.z - 10], [V.x - 12, V.z + 10, V.x + 12, V.z + 10]]) {
        for (let k = 0; k <= 14; k++) { const t = k / 14, x = ax + (bx - ax) * t, z = az + (bz - az) * t, y = S.heightAt(x, z) + 5.4 - Math.sin(t * Math.PI) * 0.9; const tri = new THREE.ConeGeometry(0.25, 0.5, 3); tri.rotateX(Math.PI); hutGeos.push({ geo: paint(tri, cols[k % 5]), x, y, z }); }
        for (const [x, z] of [[ax, az], [bx, bz]]) hutGeos.push({ geo: paint(new THREE.CylinderGeometry(0.1, 0.12, 6, 6), 0xf4f4f4), x, y: S.heightAt(x, z) + 3, z });
      }
    }
    tiled(hutGeos, vmat({ roughness: 0.7 }));
    // passerelles en bois sur les dunes
    const walkGeos = [];
    for (const [[ax, az], [bx, bz]] of S.BOARDWALKS) {
      const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 0.55), yaw = Math.atan2(bx - ax, bz - az);
      for (let i = 0; i < n; i++) {
        const k = i / n, x = ax + (bx - ax) * k, z = az + (bz - az) * k;
        const pl = new THREE.BoxGeometry(1.9, 0.07, 0.42); pl.rotateY(yaw);
        walkGeos.push({ geo: paint(pl, (cc) => cc.set(0xc49a68).multiplyScalar(0.88 + hash2(i, ax) * 0.2)), x, y: S.heightAt(x, z) + 0.05, z });
      }
    }
    tiled(walkGeos, vmat({ roughness: 0.9 }), { cast: false, noOutline: true });
  }

  // --- Poste de secours et râtelier des planches ---------------------------------------
  {
    const LG = S.LIFEGUARD, g = new THREE.Group();
    for (const [dx, dz] of [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.13, LG.top - LG.y, 6), M.mat(0xffffff)); p.position.set(dx, (LG.top - LG.y) / 2, dz); g.add(p); }
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 0.3, 14), M.mat(0xe04848)); deck.position.y = LG.top - LG.y - 0.15;
    const hut = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.3, 1.4), M.mat(0xfafafa)); hut.position.set(0, LG.top - LG.y + 0.65, 0.3);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 0.9, 4), M.mat(0xe04848)); roof.position.y = LG.top - LG.y + 1.75; roof.rotation.y = Math.PI / 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 5), M.mat(0xdddddd)); pole.position.set(0.9, LG.top - LG.y + 2.2, 0.9);
    const flagM = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.6), M.mat(0x40c060, { side: THREE.DoubleSide })); flagM.position.set(1.35, LG.top - LG.y + 3.0, 0.9);
    g.add(deck, hut, roof, pole, flagM);
    for (const s of S.lifeguardSteps) { const d = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.25, 10), M.mat(0xc49a68)); d.position.set(s.x - LG.x, s.top - 0.12 - LG.y, s.z - LG.z); g.add(d); }
    g.position.set(LG.x, LG.y, LG.z);
    sc.add(shadowy(g));
    const R = S.RACK, rack = new THREE.Group();
    for (const sx of [-1.8, 1.8]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.4, 0.14), M.mat(0x8a5a30)); p.position.set(sx, 0.7, 0); rack.add(p); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.12, 0.12), M.mat(0x8a5a30)); bar.position.y = 1.25; rack.add(bar);
    rack.position.set(R.x, R.y, R.z); rack.rotation.y = 0.15;
    sc.add(shadowy(rack));
    // bouées de la course (rouges et blanches, avec un fanion)
    const buoyGeos = [];
    const buoy = (b, flag, low) => {
      buoyGeos.push({ geo: paint(new THREE.SphereGeometry(0.55, 14, 10), (cc, x, y) => cc.set(y > 0.1 ? 0xffffff : low)), x: b.x, y: S.WATER_Y + 0.15, z: b.z });
      buoyGeos.push({ geo: paint(new THREE.CylinderGeometry(0.03, 0.03, 1.4, 4), 0x444444), x: b.x, y: S.WATER_Y + 1.0, z: b.z });
      buoyGeos.push({ geo: paint(new THREE.PlaneGeometry(0.5, 0.32), flag), x: b.x + 0.25, y: S.WATER_Y + 1.5, z: b.z });
    };
    for (const b of S.RACE.buoys.slice(0, -1)) buoy(b, 0xffd23a, 0xe83a3a);
    for (const b of S.LESSON) buoy(b, 0x5ad85a, 0x2a9a3a);
    for (const [x, z] of S.ISLAND_ROUTE) buoy({ x, z }, 0xff8a2a, 0xff8a2a);
    const buoys = new THREE.Mesh(M.mergeGeos(buoyGeos), vmat({ roughness: 0.5, side: THREE.DoubleSide }));
    sc.add(buoys); moving.push(buoys);
    fort.buoys = buoys;
  }

  // --- L'Épave, dans la Crique ------------------------------------------------------------
  const wreck = {};
  {
    const Wk = S.WRECK, g = new THREE.Group(), wood = 0x7a5232, dark = 0x4a321e;
    const plank = (cc, x, y, z) => cc.set(wood).multiplyScalar(0.8 + 0.25 * (Math.floor((y + 3) * 2.5) % 2) + hash2(Math.floor(z * 2), 3) * 0.12);
    // la coque : des membrures (côtes) et des bordés, éventrée à tribord
    const geos = [];
    for (let f = -8; f <= 8; f += 1.0) {
      const half = Wk.w / 2 - 0.3 * Math.abs(f) / 8 * 2.2, hgt = 3.2 + (f < -4 ? 1.5 : 0);
      for (const sd of [-1, 1]) {
        if (sd === 1 && f >= -2 && f <= 2) continue;                       // la brèche
        geos.push({ geo: paint(new THREE.BoxGeometry(0.3, hgt, 1.05), plank), x: sd * half, y: hgt / 2, z: f });
      }
      if (Math.abs(f % 2) < 0.01) geos.push({ geo: paint(new THREE.BoxGeometry(Wk.w, 0.3, 0.35), dark), x: 0, y: 0.15, z: f });
    }
    geos.push({ geo: paint(new THREE.ConeGeometry(Wk.w / 2, 3, 4, 1), plank), x: 0, y: 1.6, z: 9.3, rx: Math.PI / 2, ry: Math.PI / 4, sx: 0.8 });
    // le pont arrière, la cabine du capitaine, des tonneaux, des caisses
    geos.push({ geo: paint(new THREE.BoxGeometry(Wk.w - 0.4, 0.4, 5.4), plank), x: 0, y: 4.5, z: -5.5 });
    geos.push({ geo: paint(new THREE.BoxGeometry(2.4, 1.6, 1.8), dark), x: 0, y: 5.5, z: -7.6 });
    const g2 = new THREE.Mesh(M.mergeGeos(geos), vmat({ roughness: 0.92 }));
    g2.castShadow = g2.receiveShadow = true;
    g.add(g2);
    // le mât cassé, sa hune, le drapeau de pirate en lambeaux
    const mastTop = Wk.nest.top - Wk.y;
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.36, mastTop, 10), M.mat(0x6a4a2a)); mast.position.set(1.5 * 0, mastTop / 2, 1.5);
    const nest = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.3, 0.4, 14), M.mat(0x8a5a32)); nest.position.set(0, mastTop - 0.2, 1.5);
    const rag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.9, 4, 1), M.mat(0x2a2a2a, { side: THREE.DoubleSide })); rag.position.set(0.75, mastTop + 1.2, 1.5);
    const ragPole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.8, 5), M.mat(0x6a4a2a)); ragPole.position.set(0, mastTop + 0.9, 1.5);
    g.add(mast, nest, rag, ragPole);
    g.position.set(Wk.x, Wk.y - 0.3, Wk.z); g.rotation.set(0, Wk.yaw, -0.08);
    place(shadowy(g), Wk.x, Wk.z, 14, 320);
    // les caisses et les tonneaux pour monter (positions exactes des obstacles)
    const props = [];
    for (const st of Wk.steps) props.push({ geo: paint(new THREE.BoxGeometry(1.6, st.top - Wk.y + 0.5, 1.6), 0xa87a48), x: st.x, y: (st.top + Wk.y - 0.5) / 2, z: st.z, ry: Wk.yaw });
    for (const b of Wk.barrels) props.push({ geo: paint(new THREE.CylinderGeometry(0.75, 0.7, 1.4, 12), (cc, x, y) => cc.set(Math.abs(y) > 0.45 ? 0x3a3a3a : 0x8a5a32)), x: b.x, y: b.top - 0.7, z: b.z });
    const pm2 = new THREE.Mesh(M.mergeGeos(props), vmat({ roughness: 0.85 }));
    place(shadowy(pm2), Wk.x, Wk.z, 14, 320);
    Object.assign(wreck, { rag });
  }

  // --- Mouettes ---------------------------------------------------------------------------
  const gulls = [];
  {
    const bodyM = M.mat(0xffffff, { roughness: 0.6 }), wingM = M.mat(0xc8ccd4, { roughness: 0.6, side: THREE.DoubleSide }), beakM = M.mat(0xf0b020);
    const mk = () => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.14, 0.38, 4, 8), bodyM); body.rotation.x = Math.PI / 2;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), bodyM); head.position.set(0, 0.06, 0.28);
      const beak = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), beakM); beak.rotation.x = Math.PI / 2; beak.position.set(0, 0.04, 0.44);
      const wings = [];
      for (const s of [-1, 1]) {
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 0.26), wingM);
        w.geometry.translate(s * 0.38, 0, 0); w.rotation.x = -Math.PI / 2;
        const pivot = new THREE.Group(); pivot.add(w); pivot.position.set(s * 0.08, 0.05, 0); g.add(pivot); wings.push(pivot);
      }
      g.add(body, head, beak);
      g.userData.wings = wings;
      return g;
    };
    const r = rng(55);
    for (let i = 0; i < (lite ? 8 : 14); i++) {
      const gm = mk();
      gm.userData.fly = { cx: -150 + r() * 300, cz: -120 + r() * 140, R: 8 + r() * 16, y: 9 + r() * 12, w: (0.25 + r() * 0.2) * (r() < 0.5 ? -1 : 1), a: r() * 6 };
      sc.add(gm); gulls.push(gm); moving.push(gm);
    }
    // quelques-unes posées sur les poteaux du ponton (elles s'envolent si on approche)
    const P = S.PIER;
    for (const z of [P.z0 - 9, P.z0 - 25, P.z1 + 2]) {
      const gm = mk();
      gm.userData.perch = { x: P.x + P.w / 2 - 0.2, y: P.top + 0.75, z, t: 0 };
      sc.add(gm); gulls.push(gm); moving.push(gm);
    }
  }

  // --- Drapeaux (points de reprise) --------------------------------------------------------
  const flags = [];
  {
    const tex = pawFlagTex();
    for (const c of S.CHECKPOINTS) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.8, 8), M.mat(0xf2f2f2, { roughness: 0.4, metalness: 0.3 })); pole.position.y = 1.9;
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), M.GOLD()); ball.position.y = 3.85;
      const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.75, 8, 1), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.8 }));
      cloth.geometry.translate(0.65, 0, 0); cloth.position.set(0.05, 1.0, 0);
      const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.25, 28), new THREE.MeshBasicMaterial({ color: 0xffe070, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
      halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; halo.userData.noOutline = true;
      g.add(pole, ball, cloth, halo);
      g.position.set(c.x, c.y, c.z); g.rotation.y = Math.PI * 0.5;
      place(shadowy(g), c.x, c.z, 4);
      flags.push({ g, cloth, halo, base: cloth.geometry.attributes.position.array.slice(), raise: 0, raisedAt: -9 });
    }
  }

  return { moving, chars, lh, fort, gulls, flags, sails, boat, surfMat, real, cull, wreck, place, paint };
}
