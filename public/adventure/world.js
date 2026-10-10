/*
 * Dogfight Aventure — construction visuelle du monde :
 * ciel, eau, terrain, herbe animée par le vent, arbres, rochers, décor.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as L from './level1.js';
import * as M from './models.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export const SKY = {
  top: new THREE.Color(0x2f86e6),
  horizon: new THREE.Color(0xcfe8ff),
  bottom: new THREE.Color(0x9fd4f0),
  sunDir: new THREE.Vector3(0.45, 0.6, 0.38).normalize(),
};

// Générateur pseudo-aléatoire déterministe
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// Bruit de valeur lissé (pour varier les couleurs)
function noise2(x, z) {
  return Math.sin(x * 0.21 + Math.sin(z * 0.13) * 1.7) * 0.5 + Math.sin(z * 0.17 + Math.cos(x * 0.11) * 2.1) * 0.35 + Math.sin((x + z) * 0.47) * 0.15;
}

// Chemins de terre (suivent les os dorés)
const PATHS = [
  [[0, 48], [0, 10]], [[0, -8], [0, -40]], [[6, 8], [26, 4]], [[-6, 8], [-22, 5]],
  [[14, -10], [L.ELEVATOR.x + 2, L.ELEVATOR.z + 2]], [[0, 46], [-5, 44]],
];
function pathDist(x, z) {
  let best = 1e9;
  for (const [[ax, az], [bx, bz]] of PATHS) {
    const dx = bx - ax, dz = bz - az, l = dx * dx + dz * dz;
    let t = ((x - ax) * dx + (z - az) * dz) / l; t = Math.max(0, Math.min(1, t));
    best = Math.min(best, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return best;
}
export function onPath(x, z) { return pathDist(x, z) < 1.8; }

// ---------------------------------------------------------------------------
export function buildSky(scene) {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: SKY.sunDir }, uTop: { value: SKY.top }, uHorizon: { value: SKY.horizon }, uBottom: { value: SKY.bottom } },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uSun, uTop, uHorizon, uBottom;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.5)) : mix(uHorizon, uBottom, pow(-h, 0.35));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += vec3(1.0, 0.93, 0.78) * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.45 + pow(s, 5.0) * 0.12);
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide, depthWrite: false, fog: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), mat);
  sky.frustumCulled = false;
  sky.renderOrder = -10;
  scene.add(sky);
  return sky;
}

// ---------------------------------------------------------------------------
// Terrain : géométrie lisse, couleurs fondues (herbe, sable, roche, chemins)
// ---------------------------------------------------------------------------
function detailTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 256, 256);
  const r = rng(77);
  for (let i = 0; i < 9000; i++) {
    const v = 200 + Math.floor(r() * 55);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(50, 50);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildTerrain(scene, quality) {
  const size = 180, seg = quality.high ? 200 : 110;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, L.heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), tmp = new THREE.Color();
  const G1 = new THREE.Color(0x5cb83c), G2 = new THREE.Color(0x86cf4a), G3 = new THREE.Color(0x3f9a36);
  const SAND = new THREE.Color(0xf2dca6), WET = new THREE.Color(0xc8b07a), ROCK = new THREE.Color(0x9c8a78), ROCK2 = new THREE.Color(0x7c6c5e), DIRT = new THREE.Color(0xc89a62), DEEP = new THREE.Color(0x8aa890);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ny = nrm.getY(i);
    const n = noise2(x, z);
    c.copy(G1).lerp(G2, smooth(-0.2, 0.8, n)).lerp(G3, smooth(0.3, -0.9, n) * 0.6);
    c.lerp(DIRT, (1 - smooth(1.0, 2.0, pathDist(x, z))) * 0.85);
    c.lerp(tmp.copy(ROCK).lerp(ROCK2, smooth(-0.5, 0.5, n)), smooth(0.86, 0.7, ny));
    c.lerp(SAND, 1 - smooth(0.9, 1.6, y));
    c.lerp(WET, 1 - smooth(-0.1, 0.5, y));
    c.lerp(DEEP, 1 - smooth(-3, -0.6, y));
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: detailTexture(), roughness: 0.95 });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Eau : vagues, reflets du ciel et du soleil, couleur selon la profondeur, écume
// ---------------------------------------------------------------------------
function heightTexture() {
  const N = 256, data = new Uint8Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * 180 - 90, z = (j / (N - 1)) * 180 - 90;
    let h = L.heightAt(x, z);
    // les galets et l'îlot comptent comme « rivage » pour l'écume
    for (const c of L.colliders) if ((c.kind === 'stone' || c.kind === 'islet') && L.inside(c, x, z, 0)) h = Math.max(h, c.y1);
    data[j * N + i] = Math.max(0, Math.min(255, Math.round((h + 8) * 255 / 16)));
  }
  const t = new THREE.DataTexture(data, N, N, THREE.RedFormat);
  t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function buildWater(scene, fog) {
  const mat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 }, uHeight: { value: heightTexture() },
      uSun: { value: SKY.sunDir }, uSky: { value: SKY.horizon }, uSkyTop: { value: SKY.top },
      uShallow: { value: new THREE.Color(0x4fe0e0) }, uDeep: { value: new THREE.Color(0x1a78c8) },
      uFogColor: { value: fog.color }, uFogNear: { value: fog.near }, uFogFar: { value: fog.far },
    },
    vertexShader: `
      uniform float uTime;
      varying vec3 vWorld;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y += sin(w.x * 0.35 + uTime * 1.3) * 0.05 + sin(w.z * 0.3 + uTime * 1.1) * 0.05;
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      uniform float uTime, uFogNear, uFogFar;
      uniform sampler2D uHeight;
      uniform vec3 uSun, uSky, uSkyTop, uShallow, uDeep, uFogColor;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 uv = (vWorld.xz + 90.0) / 180.0;
        float ground = texture2D(uHeight, uv).r * 16.0 - 8.0;
        if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) ground = -8.0;
        float depth = vWorld.y - ground;
        // normale des petites vagues
        vec2 p = vWorld.xz;
        float t = uTime;
        float dx = cos(p.x * 0.9 + t * 1.6) * 0.06 + cos((p.x + p.y) * 1.7 + t * 2.3) * 0.04;
        float dz = cos(p.y * 0.8 + t * 1.3) * 0.06 + cos((p.x - p.y) * 1.5 + t * 2.0) * 0.04;
        vec3 n = normalize(vec3(-dx, 1.0, -dz));
        vec3 view = normalize(cameraPosition - vWorld);
        float fres = pow(1.0 - max(dot(view, n), 0.0), 4.0);
        vec3 col = mix(uShallow, uDeep, smoothstep(0.3, 5.0, depth));
        col = mix(col, mix(uSky, uSkyTop, 0.35), fres * 0.6);
        float spec = pow(max(dot(reflect(-normalize(uSun), n), view), 0.0), 180.0);
        col += vec3(1.0, 0.96, 0.85) * spec * 1.8;
        // écume au bord, animée
        float nz = vnoise(p * 1.6 + vec2(t * 0.4, t * 0.25));
        float foamEdge = 1.0 - smoothstep(0.0, 0.55 + nz * 0.35, depth);
        float ripple = smoothstep(0.75, 0.95, sin(depth * 9.0 - t * 2.5) * 0.5 + 0.5) * (1.0 - smoothstep(0.0, 1.4, depth));
        float foam = clamp(foamEdge + ripple * 0.6, 0.0, 1.0);
        col = mix(col, vec3(1.0), foam * 0.85);
        float alpha = mix(0.55, 0.92, smoothstep(0.0, 2.5, depth));
        alpha = max(alpha, foam);
        float dist = length(cameraPosition - vWorld);
        col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, dist));
        if (depth < -0.05) discard;
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(700, 700, 50, 50), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = L.WATER_Y;
  water.renderOrder = 2;
  scene.add(water);
  return water;
}

// ---------------------------------------------------------------------------
// Herbe : touffes instanciées qui ondulent au vent (shader)
// ---------------------------------------------------------------------------
function bladeClump(r, blades) {
  const parts = [];
  const pos = [], col = [];
  const base = new THREE.Color(0x4a9a30), tip = new THREE.Color(0xc8f080);
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2, d = r() * 0.3, h = 0.25 + r() * 0.3, w = 0.07 + r() * 0.03;
    const lean = (r() - 0.5) * 0.5;
    const ox = Math.cos(a) * d, oz = Math.sin(a) * d;
    const dirx = Math.cos(a + Math.PI / 2), dirz = Math.sin(a + Math.PI / 2);
    const rows = [0, 0.4, 0.75, 1];
    const pts = rows.map((k, i) => {
      const ww = w * (1 - k * 0.92);
      const bend = lean * k * k;
      return [[ox - dirx * ww + Math.cos(a) * bend, k * h, oz - dirz * ww + Math.sin(a) * bend], [ox + dirx * ww + Math.cos(a) * bend, k * h, oz + dirz * ww + Math.sin(a) * bend], k];
    });
    for (let i = 0; i < pts.length - 1; i++) {
      const [l0, r0, k0] = pts[i], [l1, r1, k1] = pts[i + 1];
      for (const [v, k] of [[l0, k0], [r0, k0], [l1, k1], [r0, k0], [r1, k1], [l1, k1]]) {
        pos.push(...v);
        const cc = base.clone().lerp(tip, k);
        col.push(cc.r, cc.g, cc.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Normales vers le haut : éclairage doux et homogène de l'herbe
  const nrm = g.attributes.normal;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  parts.push(g);
  return g;
}

export function buildGrass(scene, quality, windUniform) {
  const r = rng(9);
  const count = quality.high ? 5200 : 1300;
  const spots = [];
  for (let i = 0; i < count * 6 && spots.length < count; i++) {
    const x = (r() - 0.5) * 140, z = (r() - 0.5) * 140;
    const h = L.heightAt(x, z);
    if (h < 1.5) continue;
    const slope = Math.abs(L.heightAt(x + 0.5, z) - h) + Math.abs(L.heightAt(x, z + 0.5) - h);
    if (slope > 0.45) continue;
    if (onPath(x, z) && r() < 0.85) continue;
    if (L.colliders.some(c => c.kind !== 'trunk' && c.kind !== 'tree' && L.inside(c, x, z, 0.3) && c.y1 > h)) continue;
    spots.push([x, h, z]);
  }
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.9 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windUniform;
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      vec4 wpos = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float k = position.y * position.y * 2.2;
      float w = sin(uTime * 1.7 + wpos.x * 0.35 + wpos.z * 0.27) * 0.14 + sin(uTime * 3.3 + wpos.x * 1.1 + wpos.z * 0.6) * 0.05;
      transformed.x += w * k;
      transformed.z += w * 0.6 * k;`);
  };
  const geo = bladeClump(rng(3), quality.lite ? 6 : 9);
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  const tint = new THREE.Color();
  spots.forEach(([x, h, z], i) => {
    const sc = 0.8 + r() * 0.7;
    m4.compose(v.set(x, h - 0.03, z), q.setFromEuler(e.set(0, r() * 6.28, 0)), s.set(sc, sc * (0.8 + r() * 0.5), sc));
    inst.setMatrixAt(i, m4);
    const n = noise2(x, z);
    inst.setColorAt(i, tint.setHSL(0.27 + n * 0.03, 0.55, 0.62 + n * 0.06));
  });
  inst.receiveShadow = quality.high;
  scene.add(inst);
  return inst;
}

// Fleurs : petites corolles colorées
export function buildFlowers(scene, quality) {
  const r = rng(21);
  const geo = M.mergeGeos([
    { geo: new THREE.CylinderGeometry(0.015, 0.02, 0.35, 4, 1, true), y: 0.17 },
    { geo: new THREE.SphereGeometry(0.13, 10, 4), y: 0.36, sy: 0.3 },
  ]);
  const spots = [];
  const maxF = quality && quality.lite ? 220 : 420;
  for (let i = 0; i < 3000 && spots.length < maxF; i++) {
    const x = (r() - 0.5) * 130, z = (r() - 0.5) * 130;
    const h = L.heightAt(x, z);
    if (h < 1.6 || onPath(x, z)) continue;
    // en petits bouquets
    const n = 1 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) spots.push([x + (r() - 0.5) * 1.2, z + (r() - 0.5) * 1.2]);
  }
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), spots.length);
  const cols = [0xffffff, 0xffe04a, 0xff7aa8, 0xb48aff, 0xff9a4a];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const c = new THREE.Color();
  spots.forEach(([x, z], i) => {
    m4.compose(v.set(x, L.heightAt(x, z), z), q, s);
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.set(cols[Math.floor(r() * cols.length)]));
  });
  scene.add(inst);
}

// ---------------------------------------------------------------------------
// Arbres : troncs + feuillages ronds (instanciés), buissons
// ---------------------------------------------------------------------------
export function buildTrees(scene, quality) {
  const r = rng(5);
  const n = L.trees.length;
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.55, 5.2, 10, 4);
  // léger évasement à la base
  const tp = trunkGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); if (y < -2) { const k = 1 + (-2 - y) * 0.35; tp.setX(i, tp.getX(i) * k); tp.setZ(i, tp.getZ(i) * k); } }
  trunkGeo.computeVertexNormals();
  const trunks = new THREE.InstancedMesh(trunkGeo, M.mat(0x7a4e2c, { roughness: 0.95 }), n);
  const blobGeo = new THREE.IcosahedronGeometry(1, quality && quality.lite ? 1 : 2);
  const blobs = [];
  L.trees.forEach((t) => {
    const top = t.y + 5 * t.s;
    const k = 5 + Math.floor(r() * 3);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + r();
      const rad = i === 0 ? 0 : 1.1 * t.s;
      blobs.push({ x: t.x + Math.cos(a) * rad, y: top + (i === 0 ? 0.9 : r() * 0.8) * t.s, z: t.z + Math.sin(a) * rad, s: (i === 0 ? 1.9 : 1.3 + r() * 0.4) * t.s });
    }
    // buissons au pied
    for (let i = 0; i < 2; i++) {
      const a = r() * Math.PI * 2;
      const bx = t.x + Math.cos(a) * 1.6, bz = t.z + Math.sin(a) * 1.6;
      blobs.push({ x: bx, y: L.heightAt(bx, bz) + 0.25, z: bz, s: 0.55 + r() * 0.3, bush: true });
    }
  });
  const leaves = new THREE.InstancedMesh(blobGeo, M.mat(0xffffff, { roughness: 0.85 }), blobs.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  const c = new THREE.Color();
  const greens = [0x4caf3a, 0x5cc046, 0x3e9e34, 0x6ccf4e, 0x56b83e];
  L.trees.forEach((t, i) => {
    m4.compose(v.set(t.x, t.y + 2.4 * t.s, t.z), q.setFromEuler(e.set(0, r() * 6, (r() - 0.5) * 0.08)), s.set(t.s, t.s, t.s));
    trunks.setMatrixAt(i, m4);
  });
  blobs.forEach((b, i) => {
    m4.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e.set(r(), r(), r())), s.set(b.s, b.s * 0.9, b.s));
    leaves.setMatrixAt(i, m4);
    leaves.setColorAt(i, c.set(greens[i % greens.length]).offsetHSL(0, 0, b.bush ? -0.04 : (r() - 0.5) * 0.06));
  });
  trunks.castShadow = leaves.castShadow = true;
  trunks.receiveShadow = leaves.receiveShadow = true;
  scene.add(trunks, leaves);
}

// Rocher arrondi et un peu bosselé, avec de la mousse sur le dessus
export function rockGeometry(seed, rx, ry, rz) {
  const r = rng(seed);
  const g = new THREE.IcosahedronGeometry(1, 2);
  const p = g.attributes.position;
  const off = [r() * 10, r() * 10, r() * 10];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const k = 1 + 0.12 * Math.sin(x * 3 + off[0]) * Math.cos(z * 3 + off[1]) + 0.06 * Math.sin(y * 5 + off[2]);
    p.setXYZ(i, x * k * rx, y * k * ry, z * k * rz);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const stone = new THREE.Color(0xb4aca2), moss = new THREE.Color(0x6aa83e), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    c.copy(stone).offsetHSL(0, 0, (Math.sin(p.getX(i) * 4) * 0.5) * 0.06).lerp(moss, smooth(0.55, 0.85, n.getY(i)) * 0.8);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
export const rockMat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

// ---------------------------------------------------------------------------
// Nuages et papillons
// ---------------------------------------------------------------------------
export function buildClouds(scene) {
  const clouds = [];
  const mat = M.mat(0xffffff, { roughness: 1, emissive: 0xc8d8f0, emissiveIntensity: 0.55 });
  const r = rng(13);
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const k = 5 + Math.floor(r() * 4);
    for (let j = 0; j < k; j++) {
      const s = 3 + r() * 3.5;
      const b = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), mat);
      b.scale.set(s, s * 0.75, s);
      b.position.set((j - k / 2) * 3.2 + r() * 2, r() * 2.2 - (j === 0 || j === k - 1 ? 1 : 0), r() * 3 - 1.5);
      g.add(b);
    }
    const a = (i / 10) * Math.PI * 2;
    g.userData = { a, r: 110 + r() * 40, y: 48 + r() * 22 };
    g.position.set(Math.cos(a) * g.userData.r, g.userData.y, Math.sin(a) * g.userData.r);
    scene.add(g);
    clouds.push(g);
  }
  return clouds;
}

export function buildButterflies(scene) {
  const out = [];
  const r = rng(31);
  const cols = [0xffd84a, 0xff8ad0, 0x8ad8ff, 0xffffff, 0xff9a4a];
  for (let i = 0; i < 10; i++) {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: cols[i % cols.length], side: THREE.DoubleSide, roughness: 0.5, emissive: cols[i % cols.length], emissiveIntensity: 0.25 });
    const wing = new THREE.CircleGeometry(0.16, 10);
    const lw = new THREE.Mesh(wing, m); lw.position.x = -0.14; lw.rotation.x = -Math.PI / 2;
    const rw = new THREE.Mesh(wing, m); rw.position.x = 0.14; rw.rotation.x = -Math.PI / 2;
    const L1 = new THREE.Group(); L1.add(lw); const R1 = new THREE.Group(); R1.add(rw);
    g.add(L1, R1);
    const a = r() * Math.PI * 2, d = 10 + r() * 40;
    g.userData = { cx: Math.cos(a) * d, cz: Math.sin(a) * d, ph: r() * 10, L: L1, R: R1, sp: 0.4 + r() * 0.4 };
    scene.add(g);
    out.push(g);
  }
  return out;
}
export function animateButterflies(list, t) {
  for (const b of list) {
    const u = b.userData;
    const x = u.cx + Math.sin(t * u.sp + u.ph) * 3, z = u.cz + Math.cos(t * u.sp * 0.7 + u.ph) * 3;
    b.position.set(x, L.heightAt(x, z) + 1.2 + Math.sin(t * 2 + u.ph) * 0.4, z);
    b.rotation.y = t * u.sp + u.ph;
    const f = Math.sin(t * 18 + u.ph) * 0.9;
    u.L.rotation.z = f; u.R.rotation.z = -f;
  }
}
