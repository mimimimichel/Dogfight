/*
 * Dogfight Aventure — construction visuelle du monde :
 * ciel, eau, terrain, herbe animée par le vent, arbres, rochers, décor.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

import * as RT from './realtex.js';
import * as FOL from './foliage.js';

/** Style de rendu : réaliste (par défaut) ou dessin animé. */
export const LOOK = { real: true };

export const SKY = {
  top: new THREE.Color(0x1f74dc),
  horizon: new THREE.Color(0xbcdcf6),
  bottom: new THREE.Color(0x9fd4f0),
  sunDir: new THREE.Vector3(0.45, 0.6, 0.38).normalize(),
  glow: new THREE.Color().setRGB(1.0, 0.93, 0.78),     // halo du soleil (ciel dessiné ; orangé le soir : lumiere.js)
  dusk: { value: 0 },                                  // 1 : bande de couchant le long de l'horizon, côté soleil
};
const SKY_DEFAULT = { top: 0x1f74dc, horizon: 0xbcdcf6, bottom: 0x9fd4f0, sunDir: [0.45, 0.6, 0.38] };
/** Ambiance du niveau (ciel, brume) : couleurs recopiées dans SKY, que les shaders partagent. */
export function applySky(p) {
  p = Object.assign({}, SKY_DEFAULT, p || {});
  SKY.top.set(p.top); SKY.horizon.set(p.horizon); SKY.bottom.set(p.bottom);
  SKY.sunDir.set(...p.sunDir).normalize();
  SKY.glow.setRGB(1.0, 0.93, 0.78); SKY.dusk.value = 0;
}

// Générateur pseudo-aléatoire déterministe
function rng(seed) { let s = seed; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
// Bruit de valeur lissé (pour varier les couleurs)
function noise2(x, z) {
  return Math.sin(x * 0.21 + Math.sin(z * 0.13) * 1.7) * 0.5 + Math.sin(z * 0.17 + Math.cos(x * 0.11) * 2.1) * 0.35 + Math.sin((x + z) * 0.47) * 0.15;
}

// Chemins de terre : L.PATHS (suivent les os dorés)
function pathDist(x, z) {
  let best = 1e9;
  for (const [[ax, az], [bx, bz]] of L.PATHS) {
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
    uniforms: { uSun: { value: SKY.sunDir }, uTop: { value: SKY.top }, uHorizon: { value: SKY.horizon }, uBottom: { value: SKY.bottom }, uGlow: { value: SKY.glow }, uDusk: SKY.dusk },
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: `
      uniform vec3 uSun, uTop, uHorizon, uBottom, uGlow;
      uniform float uDusk;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(h, 0.5)) : mix(uHorizon, uBottom, pow(-h, 0.35));
        float s = max(dot(d, normalize(uSun)), 0.0);
        c += uGlow * (pow(s, 900.0) * 6.0 + pow(s, 40.0) * 0.45 + pow(s, 5.0) * 0.12);
        c += uGlow * uDusk * (pow(s, 2.5) * 0.55 + 0.12) * (1.0 - smoothstep(0.0, 0.35, abs(h)));
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
/** Sol vu de près : mille petits brins (gris, teinté par les couleurs du terrain). */
export function grassGroundTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const x = c.getContext('2d');
  x.fillStyle = '#d0d0d0'; x.fillRect(0, 0, 512, 512);
  const r = rng(91);
  for (let i = 0; i < 9000; i++) {
    const px = r() * 512, py = r() * 512, len = 4 + r() * 10, a = -Math.PI / 2 + (r() - 0.5) * 0.9, v = 150 + Math.floor(r() * 105);
    x.strokeStyle = `rgb(${v},${v},${Math.floor(v * 0.92)})`; x.lineWidth = 1 + r() * 1.4;
    x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * len, py + Math.sin(a) * len); x.stroke();
  }
  for (let i = 0; i < 260; i++) { const v = 90 + Math.floor(r() * 50); x.fillStyle = `rgba(${v},${v},${v},0.35)`; x.beginPath(); x.arc(r() * 512, r() * 512, 3 + r() * 9, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function barkTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#8a6a50'; x.fillRect(0, 0, 128, 256);
  const r = rng(31);
  for (let i = 0; i < 160; i++) {
    const px = r() * 128, w = 1 + r() * 4, v = 70 + Math.floor(r() * 90);
    x.fillStyle = `rgb(${v},${Math.floor(v * 0.8)},${Math.floor(v * 0.62)})`;
    x.fillRect(px, r() * 256, w, 20 + r() * 90);
  }
  for (let i = 0; i < 40; i++) { x.fillStyle = 'rgba(80,110,50,0.35)'; x.beginPath(); x.ellipse(r() * 128, 200 + r() * 56, 6 + r() * 10, 4 + r() * 8, 0, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 1.5);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** Petites cartes de feuilles croisées, posées autour des touffes (silhouettes feuillues). */
function leafCardGeo() {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.PlaneGeometry(1, 1);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 0.5 + uv.getX(i) * 0.5);
    g.rotateY((k / 3) * Math.PI); g.rotateX(k === 2 ? -0.9 : 0.25);
    parts.push(g);
  }
  const out = new THREE.BufferGeometry();
  const pos = [], nor = [], uvs = [];
  for (const g of parts) { const n = g.toNonIndexed(); pos.push(...n.attributes.position.array); nor.push(...n.attributes.normal.array); uvs.push(...n.attributes.uv.array); }
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  // normales vers le haut et vers l'extérieur : un feuillage éclairé doucement
  const nn = out.attributes.normal;
  for (let i = 0; i < nn.count; i++) nn.setXYZ(i, nn.getX(i) * 0.3, 0.9, nn.getZ(i) * 0.3);
  return out;
}
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
  const size = L.WORLD || 180, seg = L.WORLD ? (quality.high ? 280 : 170) : (quality.high ? 200 : 110);
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, L.heightAt(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color(), tmp = new THREE.Color();
  let gp = (L.PALETTE && L.PALETTE.ground) || [0x5cb83c, 0x86cf4a, 0x3f9a36];
  // rendu réaliste : verts plus profonds et plus variés (prairie, terre, mousse)
  if (LOOK.real) gp = gp.map((h, i) => new THREE.Color(h).lerp(new THREE.Color([0x3e6e22, 0x7a9a38, 0x2e5a1c][i]), 0.55).getHex());
  const G1 = new THREE.Color(gp[0]), G2 = new THREE.Color(gp[1]), G3 = new THREE.Color(gp[2]);
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
  const size2 = L.WORLD || 180;
  // forêt : vrai sol de sous-bois ; ailleurs : le grain de la photo, la couleur verte du terrain
  const ph = !(LOOK.real && RT.hasPhotos()) ? null : L.ID === 2 ? RT.photo('forest_ground_04', size2 / 3.5) : RT.photoGray('leafy_grass', size2 / 3.5);
  if (ph && L.ID === 2) {
    // la photo donne déjà l'herbe : les couleurs du terrain ne font plus que nuancer (sable, roche, terre)
    const col = geo.attributes.color, base = new THREE.Color(gp[1]);
    for (let i = 0; i < col.count; i++) {
      const cc = new THREE.Color(col.getX(i), col.getY(i), col.getZ(i));
      const greenish = Math.max(0, 1 - Math.abs(cc.getHSL({}).h - base.getHSL({}).h) * 6);
      cc.lerp(L.ID === 2 ? new THREE.Color(1.05, 1.05, 0.95) : new THREE.Color(0.98, 1.22, 0.78), 0.85 * greenish);   // prairie bien verte
      // taches de mousse et de lumière sur le sous-bois (moins terne)
      const px = geo.attributes.position.getX(i), pz = geo.attributes.position.getZ(i);
      const moss = smooth(0.52, 0.72, noise2(px * 0.6 + 3, pz * 0.6 - 7)) * greenish;
      cc.lerp(new THREE.Color(0.86, 1.12, 0.62), moss * 0.7).multiplyScalar(1.08);
      col.setXYZ(i, cc.r, cc.g, cc.b);
    }
  }
  const gtex = ph ? ph.map : LOOK.real ? grassGroundTexture() : detailTexture();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: gtex, roughness: 0.95, normalMap: ph ? ph.normalMap : LOOK.real ? RT.normalFor(gtex, 2) : null });
  const m = new THREE.Mesh(geo, mat);
  m.name = 'terrain';
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

// ---------------------------------------------------------------------------
// Eau : vagues, reflets du ciel et du soleil, couleur selon la profondeur, écume
// ---------------------------------------------------------------------------
function heightTexture() {
  const N = L.WORLD ? 512 : 256, data = new Uint8Array(N * N), S = L.WORLD || 180;
  const shore = L.colliders.filter(c => c.kind === 'stone' || c.kind === 'islet' || c.shore);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = (i / (N - 1)) * S - S / 2, z = (j / (N - 1)) * S - S / 2;
    let h = L.heightAt(x, z);
    // les galets et l'îlot comptent comme « rivage » pour l'écume
    for (const c of shore) if (L.inside(c, x, z, 0)) h = Math.max(h, c.y1);
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
      uTime: { value: 0 }, uHeight: { value: heightTexture() }, uHalf: { value: (L.WORLD || 180) / 2 },
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
      uniform float uTime, uFogNear, uFogFar, uHalf;
      uniform sampler2D uHeight;
      uniform vec3 uSun, uSky, uSkyTop, uShallow, uDeep, uFogColor;
      varying vec3 vWorld;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float vnoise(vec2 p) {
        vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
      }
      void main() {
        vec2 uv = (vWorld.xz + uHalf) / (2.0 * uHalf);
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
function bladeClump(r, blades, fine) {
  // fine (ordinateur) : beaucoup de brins fins et indexés, teintes variées (quelques brins secs)
  const pos = [], col = [], idx = [];
  const base = new THREE.Color(fine ? 0x3b6424 : 0x2c6a1c), tip = new THREE.Color(fine ? 0x9cba58 : 0xd8f088), dry = new THREE.Color(0xc8b878);
  const rows = fine ? [0, 0.35, 0.68, 1] : [0, 0.4, 0.75, 1];
  for (let b = 0; b < blades; b++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.75;
    const h = fine ? 0.16 + r() * 0.42 : 0.22 + r() * 0.38, w = fine ? 0.011 + r() * 0.01 : 0.035 + r() * 0.025;
    const lean = (r() - 0.5) * (fine ? 1.0 : 0.7);
    const ox = Math.cos(a) * d, oz = Math.sin(a) * d;
    const face = r() * Math.PI * 2, dirx = Math.cos(face), dirz = Math.sin(face);
    const la = fine ? face + Math.PI / 2 : a;
    const tipC = tip.clone().lerp(dry, fine && r() < 0.12 ? 0.7 : 0).multiplyScalar(fine ? 0.85 + r() * 0.3 : 1);
    const b0 = pos.length / 3;
    rows.forEach((k) => {
      const ww = w * (1 - k * 0.92), bend = lean * k * k;
      const cx = ox + Math.cos(fine ? la : a) * bend, cz = oz + Math.sin(fine ? la : a) * bend;
      const dx = fine ? dirx : Math.cos(a + Math.PI / 2), dz = fine ? dirz : Math.sin(a + Math.PI / 2);
      pos.push(cx - dx * ww, k * h, cz - dz * ww, cx + dx * ww, k * h, cz + dz * ww);
      const cc = base.clone().lerp(tipC, Math.pow(k, 0.8));
      col.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
    });
    for (let i = 0; i < rows.length - 1; i++) { const q = b0 + i * 2; idx.push(q, q + 1, q + 2, q + 1, q + 3, q + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  // Normales vers le haut : éclairage doux et homogène de l'herbe
  const nrm = new Float32Array(pos.length); for (let i = 1; i < nrm.length; i += 3) nrm[i] = 1;
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setIndex(idx);
  return g;
}

export function buildGrass(scene, quality, windUniform) {
  const r = rng(9);
  // herbe haute et dense (le « tapis » de prairie)
  const count = (quality.high ? (RT.isUltra() ? 15000 : 9000) : 1500) * (L.GRASS_K || 1);
  const spots = [];
  for (let i = 0; i < count * 6 && spots.length < count; i++) {
    const x = (r() - 0.5) * (L.WORLD ? L.WORLD - 20 : 140), z = (r() - 0.5) * (L.WORLD ? L.WORLD - 20 : 140);
    const h = L.heightAt(x, z);
    if (h < 1.5) continue;
    const slope = Math.abs(L.heightAt(x + 0.5, z) - h) + Math.abs(L.heightAt(x, z + 0.5) - h);
    if (slope > 0.45) continue;
    if (onPath(x, z) && r() < 0.85) continue;
    if (L.noGrass && L.noGrass(x, z)) continue;
    if (L.inWater(x, z)) continue;
    if ((L.near ? L.near(x, z, 1) : L.colliders).some(c => c.kind !== 'trunk' && c.kind !== 'tree' && L.inside(c, x, z, 0.3) && c.y1 > h)) continue;
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
  const geo = quality.lite ? bladeClump(rng(3), 7) : bladeClump(rng(3), 34, true);
  const inst = new THREE.InstancedMesh(geo, mat, spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  const tint = new THREE.Color();
  spots.forEach(([x, h, z], i) => {
    const sc = 0.75 + r() * 0.5;
    m4.compose(v.set(x, h - 0.03, z), q.setFromEuler(e.set(0, r() * 6.28, 0)), s.set(sc, sc * (0.8 + r() * 0.5), sc));
    inst.setMatrixAt(i, m4);
    const n = noise2(x, z);
    inst.setColorAt(i, tint.setHSL(0.22 + n * 0.05 + (r() - 0.5) * 0.03, 0.55 + r() * 0.15, 0.62 + n * 0.08 + r() * 0.08));
  });
  inst.receiveShadow = quality.high;
  inst.userData.noOutline = true;
  scene.add(inst);
  return inst;
}

function tint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo, n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
// Fleurs : petites corolles colorées
export function buildFlowers(scene, quality) {
  const r = rng(21);
  const petals = [];
  for (let k = 0; k < 5; k++) { const a = (k / 5) * Math.PI * 2; petals.push({ geo: tint(new THREE.SphereGeometry(0.06, 6, 3), 0xffffff), x: Math.cos(a) * 0.065, y: 0.34, z: Math.sin(a) * 0.065, sy: 0.25, ry: -a }); }
  const geo = M.mergeGeos([
    { geo: tint(new THREE.CylinderGeometry(0.008, 0.012, 0.34, 4, 1, true), 0x5a9a3a), y: 0.17 },
    ...petals,
    { geo: tint(new THREE.SphereGeometry(0.035, 6, 4), 0xffd040), y: 0.355, sy: 0.6 },
  ]);
  const spots = [];
  const maxF = (quality && quality.lite ? 350 : 1500) * (L.GRASS_K || 1);
  for (let i = 0; i < 3000 && spots.length < maxF; i++) {
    const x = (r() - 0.5) * (L.WORLD ? L.WORLD - 20 : 130), z = (r() - 0.5) * (L.WORLD ? L.WORLD - 20 : 130);
    const h = L.heightAt(x, z);
    if (h < 1.6 || onPath(x, z) || (L.noGrass && L.noGrass(x, z))) continue;
    // en petits bouquets
    const n = 1 + Math.floor(r() * 4);
    for (let k = 0; k < n; k++) {
      const fx = x + (r() - 0.5) * 1.2, fz = z + (r() - 0.5) * 1.2;
      if (!L.inWater(fx, fz, 0.8)) spots.push([fx, fz]);
    }
  }
  const inst = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: true }), spots.length);
  const cols = [0xffffff, 0xffe04a, 0xff7aa8, 0xff7aa8, 0xffb0d0, 0xb48aff, 0xff9a4a, 0xfff4f8];
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
  const c = new THREE.Color();
  spots.forEach(([x, z], i) => {
    m4.compose(v.set(x, L.heightAt(x, z), z), q, s);
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.set(cols[Math.floor(r() * cols.length)]));
  });
  inst.userData.noOutline = true;
  scene.add(inst);
}

// ---------------------------------------------------------------------------
// Arbres : troncs + feuillages ronds (instanciés), buissons
// ---------------------------------------------------------------------------
export function buildTrees(scene, quality) {
  if (LOOK.real && FOL.hasBroadleaf()) return buildBroadleaves(scene, quality);
  const r = rng(5);
  const n = L.trees.length;
  const trunkGeo = new THREE.CylinderGeometry(0.32, 0.55, 5.2, 10, 4);
  // léger évasement à la base
  const tp = trunkGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) { const y = tp.getY(i); if (y < -2) { const k = 1 + (-2 - y) * 0.35; tp.setX(i, tp.getX(i) * k); tp.setZ(i, tp.getZ(i) * k); } }
  trunkGeo.computeVertexNormals();
  const phb = LOOK.real && RT.hasPhotos() ? RT.photo('bark_willow_02', 1.5, 2) : null;
  const bark = LOOK.real && !phb ? barkTexture() : null;
  const trunks = new THREE.InstancedMesh(trunkGeo, phb ? new THREE.MeshStandardMaterial({ map: phb.map, normalMap: phb.normalMap, roughness: 0.95 })
    : LOOK.real ? new THREE.MeshStandardMaterial({ color: 0xb8a088, map: bark, normalMap: RT.normalFor(bark, 6), roughness: 0.95 }) : M.mat(0x7a4e2c, { roughness: 0.95 }), n);
  const blobGeo = leafClusterGeo(L.ID === 3 ? 6 : quality && quality.lite ? 10 : 16);   // (la ville a des centaines d'arbres : version simple)
  const blobs = [];
  // style du feuillage selon le niveau (la forêt du niveau 2 a moins de touffes, plus grosses)
  const ST = Object.assign({ min: 5, extra: 3, rad: 1.1, big: 1.9, small: 1.3, bushes: 2 }, L.TREE_STYLE || {});
  L.trees.forEach((t) => {
    const top = t.y + (t.h || 5 * t.s);
    const k = ST.min + Math.floor(r() * ST.extra);
    for (let i = 0; i < k; i++) {
      const a = (i / k) * Math.PI * 2 + r();
      const rad = i === 0 ? 0 : ST.rad * t.s;
      blobs.push({ x: t.x + Math.cos(a) * rad, y: top + (i === 0 ? 0.9 : r() * 0.8) * t.s, z: t.z + Math.sin(a) * rad, s: (i === 0 ? ST.big : ST.small + r() * 0.4) * t.s });
    }
    // buissons au pied
    for (let i = 0; i < ST.bushes; i++) {
      const a = r() * Math.PI * 2;
      const bx = t.x + Math.cos(a) * 1.6, bz = t.z + Math.sin(a) * 1.6;
      blobs.push({ x: bx, y: L.heightAt(bx, bz) + 0.25, z: bz, s: 0.55 + r() * 0.3, bush: true });
    }
  });
  const leaves = new THREE.InstancedMesh(blobGeo, leafMaterial(), blobs.length);
  leaves.customDepthMaterial = leafDepthMaterial();
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), e = new THREE.Euler();
  const c = new THREE.Color();
  const greens = (L.PALETTE && L.PALETTE.leaves) || [0x4caf3a, 0x5cc046, 0x3e9e34, 0x6ccf4e, 0x56b83e];
  L.trees.forEach((t, i) => {
    const th = t.h || 5 * t.s;
    m4.compose(v.set(t.x, t.y + 2.4 * th / 5, t.z), q.setFromEuler(e.set(0, r() * 6, (r() - 0.5) * 0.08)), s.set(t.s, th / 5, t.s));
    trunks.setMatrixAt(i, m4);
  });
  blobs.forEach((b, i) => {
    m4.compose(v.set(b.x, b.y, b.z), q.setFromEuler(e.set(r(), r(), r())), s.set(b.s, b.s * 0.9, b.s));
    leaves.setMatrixAt(i, m4);
    leaves.setColorAt(i, c.set(greens[i % greens.length]).offsetHSL(0, LOOK.real ? -0.14 : 0, b.bush ? -0.04 : (r() - 0.5) * 0.06));   // (réaliste : verts moins criards)
  });
  trunks.castShadow = leaves.castShadow = true;
  if (LOOK.real) buildFerns(scene, quality, r);
  if (LOOK.real && RT.isUltra() && RT.scanTree()) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    buildScanTrees(scene, (i, t) => {
      trunks.setMatrixAt(i, zero);
      blobs.forEach((b, k) => { if (Math.hypot(b.x - t.x, b.z - t.z) < 4 && !b.bush) leaves.setMatrixAt(k, zero); });
      trunks.instanceMatrix.needsUpdate = true; leaves.instanceMatrix.needsUpdate = true;
    });
  }
  if (LOOK.real) buildLeafFringe(scene, leaves, blobs, quality, L.WORLD ? (quality && quality.lite ? 0 : 12) : quality && quality.lite ? 4 : 22);
  if (false) {
    // (feuilles détaillées autour de chaque touffe : retiré, ça faisait des taches sombres sur téléphone)
    const per = quality && quality.lite ? 5 : L.WORLD ? 6 : 12;
    const cards = new THREE.InstancedMesh(leafCardGeo(), new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.8 }), blobs.length * per);
    cards.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: leafTexture(), alphaTest: 0.45 });
    let j = 0;
    blobs.forEach((b, i) => {
      for (let k = 0; k < per; k++) {
        const u = r() * 2 - 1, a = r() * Math.PI * 2, up = Math.max(-0.3, u * 0.8 + 0.25), rr = Math.sqrt(1 - up * up);
        const d = b.s * (0.9 + r() * 0.35), sz = b.s * (1.1 + r() * 0.6);
        m4.compose(v.set(b.x + Math.cos(a) * rr * d, b.y + up * d * 0.9, b.z + Math.sin(a) * rr * d), q.setFromEuler(e.set((r() - 0.5) * 0.6, r() * 6.28, (r() - 0.5) * 0.6)), s.set(sz, sz, sz));
        cards.setMatrixAt(j, m4);
        cards.setColorAt(j, c.set(greens[i % greens.length]).offsetHSL((r() - 0.5) * 0.02, -0.05, 0.02 + (r() - 0.5) * 0.08));
        j++;
      }
    });
    cards.castShadow = true; cards.receiveShadow = true;
    cards.userData.noOutline = true;
    scene.add(cards);
  }
  if (L.WORLD) leaves.userData.noOutline = true;   // grande ville : beaucoup d'arbres, pas de contour
  trunks.receiveShadow = leaves.receiveShadow = true;
  scene.add(trunks, leaves);
}

// Rocher : une boule finement découpée, bosselée sur plusieurs échelles, avec quelques
// grandes faces de cassure bien plates (comme un vrai bloc de pierre) et de la mousse dessus.
function rnoise(x, y, z) {
  const h = (a, b, c) => { const v = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return v - Math.floor(v); };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(h(ix, iy, iz), h(ix + 1, iy, iz), fx), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), fx), fy),
    l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), fx), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
/** Fusionne les sommets confondus (la géométrie d'origine est « éclatée » par face). */
function weld(g) {
  const p = g.attributes.position, map = new Map(), idx = [], pos = [];
  for (let i = 0; i < p.count; i++) {
    const k = Math.round(p.getX(i) * 1e4) + ',' + Math.round(p.getY(i) * 1e4) + ',' + Math.round(p.getZ(i) * 1e4);
    let j = map.get(k);
    if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(p.getX(i), p.getY(i), p.getZ(i)); }
    idx.push(j);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setIndex(idx);
  return out;
}
export function rockGeometry(seed, rx, ry, rz) {
  const r = rng(seed);
  const g = weld(new THREE.IcosahedronGeometry(1, 10));
  const p = g.attributes.position;
  const o = [r() * 40, r() * 40, r() * 40];
  // plans de cassure : on rabote tout ce qui dépasse
  const cuts = [];
  for (let k = 0; k < 8; k++) {
    const a = r() * Math.PI * 2, e = (r() - 0.35) * 1.2;
    cuts.push({ n: [Math.cos(a) * Math.cos(e), Math.sin(e), Math.sin(a) * Math.cos(e)], d: 0.8 + r() * 0.12 });
  }
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const big = rnoise(x * 1.3 + o[0], y * 1.3 + o[1], z * 1.3 + o[2]) - 0.5;
    const mid = rnoise(x * 3.1 + o[1], y * 3.1 + o[2], z * 3.1 + o[0]) - 0.5;
    const fine = rnoise(x * 8 + o[2], y * 8 + o[0], z * 8 + o[1]) - 0.5;
    let k = 1 + big * 0.26 + mid * 0.12 + fine * 0.05;
    x *= k; y *= k; z *= k;
    for (const c of cuts) {
      const dd = x * c.n[0] + y * c.n[1] + z * c.n[2];
      if (dd > c.d) { const t = dd - c.d - fine * 0.03; x -= c.n[0] * t; y -= c.n[1] * t; z -= c.n[2] * t; }
    }
    if (y < -0.55) y = -0.55 + (y + 0.55) * 0.25;      // posé à plat sur le sol
    p.setXYZ(i, x * rx, y * ry, z * rz);
  }
  g.computeVertexNormals();
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3);
  const stone = new THREE.Color(0xd8d2ca), dark = new THREE.Color(0xa8a096), moss = new THREE.Color(0x8ab858), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const v = rnoise(x * 0.9 + o[0], y * 0.9, z * 0.9 + o[1]);
    c.copy(stone).lerp(dark, smooth(0.3, 0.8, v) * 0.6 + smooth(0.0, -0.6, n.getY(i)) * 0.35);
    const mossK = smooth(0.45, 0.85, n.getY(i)) * smooth(0.25, 0.6, rnoise(x * 1.6 + o[2], y * 1.6, z * 1.6));
    c.lerp(moss, mossK * 0.7);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
/** Aplatit le dessus d'un rocher (on voit bien où se poser) ; renvoie la hauteur du dessus. */
export function flattenRockTop(geo, band) {
  const p = geo.attributes.position;
  let top = -Infinity;
  for (let i = 0; i < p.count; i++) top = Math.max(top, p.getY(i));
  const cut = top - (band || 0.35);
  let out = -Infinity;
  for (let i = 0; i < p.count; i++) { let y = p.getY(i); if (y > cut) { y = cut + (y - cut) * 0.12; p.setY(i, y); } out = Math.max(out, y); }
  geo.computeVertexNormals();
  return out;
}
/**
 * Matière des rochers : photo de roche moussue plaquée « des trois côtés » (projection
 * triplanaire : pas d'étirement, pas de couture), teintée par les couleurs du rocher.
 */
let rockM = null;
export const rockMat = () => {
  if (rockM) return rockM;
  const ph = LOOK.real && RT.hasPhotos() ? RT.photo('mossy_rock', 1) : null;
  if (!ph) return (rockM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, map: ph.map, color: new THREE.Color(1.9, 1.85, 1.78) });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = 'varying vec3 vTriP; varying vec3 vTriN;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n  vTriP = position * 0.32; vTriN = normal;');
    sh.fragmentShader = 'varying vec3 vTriP; varying vec3 vTriN;\n' + sh.fragmentShader.replace('#include <map_fragment>', `
      vec3 bw = pow(abs(normalize(vTriN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
      vec4 tx = texture2D(map, vTriP.zy) * bw.x + texture2D(map, vTriP.xz) * bw.y + texture2D(map, vTriP.xy) * bw.z;
      diffuseColor *= tx;`);
  };
  m.customProgramCacheKey = () => 'rockTri';
  return (rockM = m);
};

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
    g.traverse(k => { k.userData.noOutline = true; });
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

// ===========================================================================
// Décor « fantasy » : ruines, chemins pavés, cristaux, feuillages peints,
// nuages peints, panorama lointain (montagnes, château, îles flottantes).
// ===========================================================================

/** Texture de pierres taillées (blocs décalés, joints, taches de mousse). */
let stoneTex = null;
export function stoneTexture() {
  if (stoneTex) return stoneTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const r = rng(91);
  x.fillStyle = '#8a857c'; x.fillRect(0, 0, 256, 256);
  const rows = 6, bh = 256 / rows;
  for (let j = 0; j < rows; j++) {
    let px = j % 2 ? -32 : 0;
    while (px < 256) {
      const w = 48 + r() * 40;
      const l = 185 + Math.floor(r() * 40);
      x.fillStyle = `rgb(${l},${l - 6},${l - 18})`;
      x.beginPath(); x.roundRect(px + 3, j * bh + 3, w - 6, bh - 6, 6); x.fill();
      // reflet en haut du bloc, ombre en bas
      x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(px + 5, j * bh + 4, w - 10, 4);
      x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(px + 5, j * bh + bh - 9, w - 10, 4);
      for (let k = 0; k < 6; k++) { x.fillStyle = `rgba(0,0,0,${0.05 + r() * 0.08})`; x.beginPath(); x.arc(px + r() * w, j * bh + r() * bh, 2 + r() * 5, 0, 7); x.fill(); }
      px += w;
    }
  }
  for (let k = 0; k < 40; k++) {
    x.fillStyle = `rgba(${70 + r() * 40},${120 + r() * 50},${40 + r() * 20},${0.35 + r() * 0.3})`;
    x.beginPath(); x.ellipse(r() * 256, r() * 256, 4 + r() * 16, 3 + r() * 8, r() * 3, 0, 7); x.fill();
  }
  stoneTex = new THREE.CanvasTexture(c);
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  stoneTex.colorSpace = THREE.SRGBColorSpace;
  stoneTex.anisotropy = 4;
  return stoneTex;
}
let stoneM = null;
export const stoneMat = () => {
  if (stoneM) return stoneM;
  const ph = LOOK.real && RT.hasPhotos() ? RT.photo('mossy_stone_wall', 0.6) : null;
  stoneM = ph ? new THREE.MeshStandardMaterial({ map: ph.map, normalMap: ph.normalMap, vertexColors: true, roughness: 0.9, color: new THREE.Color(1.7, 1.65, 1.55) })
    : new THREE.MeshStandardMaterial({ map: stoneTexture(), vertexColors: true, roughness: 0.9, normalMap: LOOK.real ? RT.normalFor(stoneTexture(), 5) : null });
  return stoneM;
};

/** Mousse sur le dessus + assombrissement en bas (couleurs de sommets). */
function mossy(g, top, bottom) {
  const p = g.attributes.position, n = g.attributes.normal;
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  const moss = new THREE.Color(0x8cc04a), stone = new THREE.Color(0xffffff), dark = new THREE.Color(0xb0a898);
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    c.copy(stone).lerp(dark, smooth(bottom + 1.2, bottom, y));
    c.lerp(moss, Math.max(smooth(0.5, 0.9, n.getY(i)) * smooth(top - 0.8, top, y), smooth(bottom + 0.6, bottom, y) * 0.7));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Colonne cannelée, éventuellement brisée (sommet déchiqueté). */
function pillarGeo(h, broken, seed) {
  const r = rng(seed);
  const shaft = new THREE.CylinderGeometry(0.48, 0.52, h - 0.7, 16, Math.max(2, Math.round(h * 2)));
  const p = shaft.attributes.position, uv = shaft.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 - 0.06 * Math.max(0, Math.cos(a * 8)); // cannelures
    p.setX(i, x * k); p.setZ(i, z * k);
    uv.setXY(i, uv.getX(i) * 2, (p.getY(i) + h) / 1.4);
  }
  if (broken) {
    const topY = (h - 0.7) / 2;
    for (let i = 0; i < p.count; i++) if (p.getY(i) > topY - 0.01) p.setY(i, topY - r() * 0.5);
  }
  shaft.translate(0, 0.35 + (h - 0.7) / 2, 0);
  const parts = [shaft, new THREE.BoxGeometry(1.35, 0.35, 1.35).translate(0, 0.175, 0)];
  if (!broken) {
    parts.push(new THREE.CylinderGeometry(0.62, 0.48, 0.2, 16).translate(0, h - 0.45, 0));
    parts.push(new THREE.BoxGeometry(1.3, 0.3, 1.3).translate(0, h - 0.15, 0));
  }
  const g = M.mergeGeos(parts.map(geo => ({ geo })));
  const uvs = []; for (const geo of parts) { const n = geo.index ? geo.index.count : geo.attributes.position.count; const u = geo.attributes.uv; const idx = geo.index; for (let i = 0; i < n; i++) { const k = idx ? idx.getX(i) : i; uvs.push(u.getX(k), u.getY(k)); } }
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  return mossy(g, h, 0);
}

/** Liane pendante (petit tube vert). */
function vine(x0, y0, z0, len, seed) {
  const r = rng(seed), pts = [];
  for (let i = 0; i <= 6; i++) pts.push(new THREE.Vector3(x0 + Math.sin(i + seed) * 0.12, y0 - (i / 6) * len, z0 + Math.cos(i * 1.3 + seed) * 0.12));
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.018 + r() * 0.012, 4);
  return g;
}

/**
 * Mode ultra : les plus grands arbres deviennent de vrais jacarandas scannés
 * (les autres gardent leur forme simple, plus légère).
 */
/**
 * Rendu réaliste : de vrais feuillus (rameaux de feuilles scannées, écorce photo, vent : foliage.js).
 * Un InstancedMesh par espèce (bois + feuillage : 2 appels de dessin), buisson au pied compris.
 */
function buildBroadleaves(scene, quality) {
  const r = rng(5), lite = !!(quality && quality.lite);
  const greens = (L.PALETTE && L.PALETTE.leaves) || [0x4caf3a, 0x5cc046, 0x3e9e34, 0x6ccf4e, 0x56b83e];
  const ST = Object.assign({ bushes: 2 }, L.TREE_STYLE || {});
  const groups = { round: [], cherry: [], fruit: [] };
  L.trees.forEach((t, i) => {
    const col = greens[i % greens.length];
    const sp = t.apple ? 'fruit' : FOL.isBlossom(col) ? 'cherry' : 'round';
    groups[sp].push({ t, i, col });
  });
  const meshes = [];
  let seed = 1;
  for (const sp in groups) {
    const list = groups[sp];
    if (!list.length) continue;
    const inst = FOL.broadleafMesh(list.map(e => e.t), {
      species: sp, seed: seed++, lite, bush: sp === 'round' && ST.bushes > 0,
      rot: () => r() * 6.28,
      tint: (k, t, c) => FOL.leafTint(list[k].col, c, (r() - 0.5) * 0.12),
    });
    meshes.push({ inst, list });
    scene.add(inst);
  }
  if (LOOK.real) buildFerns(scene, quality, r);
  if (RT.isUltra() && RT.scanTree()) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    buildScanTrees(scene, (i) => {
      for (const { inst, list } of meshes) { const k = list.findIndex(e => e.i === i); if (k >= 0) { inst.setMatrixAt(k, zero); inst.instanceMatrix.needsUpdate = true; } }
    });
  }
}

function buildScanTrees(scene, hide) {
  const T = RT.scanTree();
  const want = L.ID === 3 ? 0 : 8;
  if (!want) return;
  // les arbres les plus proches du départ (on les voit le plus)
  const order = L.trees.map((t, i) => [Math.hypot(t.x - L.START.x, t.z - L.START.z), i]).sort((a, b) => a[0] - b[0]).slice(0, want).map(e => e[1]);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();
  const parts = { trunk: [], branches: [], leaves: [] };
  for (const i of order) {
    const t = L.trees[i];
    hide(i, t);                       // l'ancien arbre disparaît
    const k = (t.h || 6) / 19 * 1.15;
    m4.compose(v.set(t.x, t.y - 0.1, t.z), q.setFromEuler(e.set(0, (t.x * 13 + t.z * 7) % 6.28, 0)), sv.set(k, k, k));
    for (const p in parts) parts[p].push(m4.clone());
  }
  for (const p of ['trunk', 'branches', 'leaves']) {
    const leaf = p === 'leaves';
    const mat = new THREE.MeshStandardMaterial({ map: T[p].tex, roughness: leaf ? 0.75 : 0.9, side: THREE.DoubleSide, alphaTest: leaf ? 0.5 : 0 });
    const inst = new THREE.InstancedMesh(T[p].geo, mat, parts[p].length);
    parts[p].forEach((m, j) => inst.setMatrixAt(j, m));
    if (leaf) inst.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: T[p].tex, alphaTest: 0.5 });
    inst.castShadow = true; inst.receiveShadow = true; inst.userData.noOutline = true;
    scene.add(inst);
  }
}

/** Brin feuillu (gris clair : la couleur vient de la couronne), pour la frange des feuillages. */
let sprigTex = null;
function sprigTexture() {
  if (sprigTex) return sprigTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const r = rng(321);
  const leaf = (px, py, a, len) => {
    const v = 0.72 + r() * 0.28, h = r();
    x.save(); x.translate(px, py); x.rotate(a);
    x.fillStyle = `rgb(${Math.round(255 * v * (0.86 + h * 0.1))},${Math.round(255 * v)},${Math.round(255 * v * (0.72 + h * 0.12))})`;
    x.beginPath(); x.moveTo(0, 0);
    x.quadraticCurveTo(len * 0.36, -len * 0.42, 0, -len);
    x.quadraticCurveTo(-len * 0.36, -len * 0.42, 0, 0); x.fill();
    x.strokeStyle = `rgba(60,70,40,0.35)`; x.lineWidth = 1; x.beginPath(); x.moveTo(0, -1); x.lineTo(0, -len * 0.85); x.stroke();
    x.restore();
  };
  // une touffe de feuilles serrées, plus claire au centre, découpée sur les bords
  for (let i = 0; i < 230; i++) {
    const a = r() * Math.PI * 2, d = Math.pow(r(), 0.6) * 108;
    const px = 128 + Math.cos(a) * d, py = 132 + Math.sin(a) * d * 0.9;
    leaf(px, py, a + Math.PI / 2 + (r() - 0.5) * 1.2, 20 + r() * 18 - d * 0.06);
  }
  sprigTex = new THREE.CanvasTexture(c);
  sprigTex.colorSpace = THREE.SRGBColorSpace; sprigTex.anisotropy = 4;
  return sprigTex;
}
/**
 * Frange de petits rameaux autour de chaque couronne : silhouette découpée en
 * feuilles. Les rameaux sont éclairés comme la couronne (normales rondes depuis
 * son centre, des deux côtés) : pas de taches sombres.
 */
export function buildLeafFringe(scene, leaves, blobs, quality, per) {
  if (!per) return;
  const r = rng(909);
  const m4 = new THREE.Matrix4(), c = new THREE.Color(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3(), w = new THREE.Vector3(), n = new THREE.Vector3();
  const quad = [[-0.5, 0, 0, 0], [0.5, 0, 1, 0], [0.5, 1, 1, 1], [-0.5, 1, 0, 1]];
  const pos = [], nor = [], col = [], uv = [], idx = [];
  blobs.forEach((b, i) => {
    leaves.getMatrixAt(i, m4);
    if (m4.elements[0] === 0 && m4.elements[5] === 0) return;     // couronne remplacée (arbre scanné)
    if (leaves.instanceColor) leaves.getColorAt(i, c); else c.set(0x4caf3a);
    const k = b.bush ? Math.ceil(per / 3) : per;
    for (let j = 0; j < k; j++) {
      // posé sur la surface de la couronne, à peu près face à l'extérieur
      const up = -0.55 + r() * 1.5, a = r() * Math.PI * 2, uy = Math.max(-1, Math.min(1, up)), rr = Math.sqrt(1 - uy * uy);
      const d = b.s * (0.88 + r() * 0.3), size = b.s * (0.85 + r() * 0.5);
      const nx = Math.cos(a) * rr, nz = Math.sin(a) * rr;
      const cx = b.x + nx * d, cy = b.y + uy * d * 0.85, cz = b.z + nz * d;
      w.set(nx, uy, nz);
      q.setFromUnitVectors(n.set(0, 0, 1), w);
      q.multiply(new THREE.Quaternion().setFromEuler(e.set((r() - 0.5) * 1.2, (r() - 0.5) * 1.2, r() * 6.28)));
      const base = pos.length / 3;
      for (const [qx, qy, u, vv] of quad) {
        v.set(qx * size, (qy - 0.5) * size, 0).applyQuaternion(q);
        w.set(cx + v.x, cy + v.y, cz + v.z);
        pos.push(w.x, w.y, w.z);
        n.set(w.x - b.x, (w.y - b.y) + b.s * 0.15, w.z - b.z).normalize();
        nor.push(n.x, n.y, n.z);
        // même dégradé que la couronne : clair en haut, plus sombre dessous
        const t = smooth(-0.9, 0.9, (w.y - b.y) / b.s) * 0.6 + smooth(-0.5, 1, n.y) * 0.4, l = 0.62 + 0.45 * t;
        col.push(c.r * l, c.g * l, c.b * l * 0.95);
        uv.push(u, vv);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  });
  if (!idx.length) return;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  const tex = sprigTexture();
  const mat = new THREE.MeshStandardMaterial({ map: tex, vertexColors: true, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.85 });
  mat.onBeforeCompile = (sh) => {
    // l'envers d'un rameau est éclairé comme l'endroit (sinon : feuilles noires)
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
  };
  mat.customProgramCacheKey = () => 'fringe';
  const mesh = new THREE.Mesh(g, mat);
  mesh.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.5 });
  mesh.castShadow = !(quality && quality.lite); mesh.receiveShadow = true;
  mesh.userData.noOutline = true;
  scene.add(mesh);
}

/** Fougères scannées au pied des arbres et des ruines (rendu réaliste). */
function buildFerns(scene, quality, r) {
  const F = RT.plant('fern_02');
  if (!F || L.ID === 3) return;
  const spots = [];
  const max = quality && quality.lite ? 10 : 60;
  for (const t of L.trees) {
    if (spots.length >= max) break;
    if (r() < 0.45) continue;
    const a = r() * Math.PI * 2, d = 1.2 + r() * 1.2, x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
    if (onPath(x, z) || L.inWater(x, z) || L.heightAt(x, z) < 0.5) continue;
    spots.push([x, z, 0.55 + r() * 0.5]);
  }
  for (const ru of L.ruins || []) if (spots.length < max + 6 && ru.type !== 'arch') { const a = r() * 6.28; spots.push([ru.x + Math.cos(a) * 1.3, ru.z + Math.sin(a) * 1.3, 0.6]); }
  if (!spots.length) return;
  const mat = new THREE.MeshStandardMaterial({ map: F.tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  const inst = new THREE.InstancedMesh(F.geo, mat, spots.length);
  inst.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: F.tex, alphaTest: 0.5 });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler();
  spots.forEach(([x, z, k], i) => { m4.compose(v.set(x, L.heightAt(x, z) - 0.02, z), q.setFromEuler(e.set(0, r() * 6.28, 0)), sv.set(k, k, k)); inst.setMatrixAt(i, m4); });
  inst.castShadow = !(quality && quality.lite); inst.receiveShadow = true; inst.userData.noOutline = true;
  scene.add(inst);
}

/** Lierre touffu sur l'arche et les colonnes (rendu réaliste). */
function buildIvy(scene) {
  const r = rng(808), spots = [];
  for (const ru of L.ruins) {
    if (ru.type === 'arch') {
      const half = ru.span / 2 + 0.8;
      for (let i = 0; i < 150; i++) {
        const x = (r() * 2 - 1) * half, side = r();
        const yTop = 0.35 + 0.45 + Math.cos((x / half) * Math.PI / 2) * 0.6;
        let px = ru.x + x, py, pz;
        if (side < 0.45) { py = ru.y + yTop - r() * 0.2; pz = ru.z + (r() - 0.5) * 1.2; }
        else { py = ru.y + yTop - 0.2 - r() * 1.1; pz = ru.z + (side < 0.72 ? -0.7 : 0.7); }
        if (Math.abs(x) > half - 0.9 && r() < 0.6) py -= r() * 3.2;          // descend le long des piliers
        spots.push([px, py, pz, 0.32 + r() * 0.2]);
      }
    } else if (ru.type === 'pillar' && !ru.broken) {
      for (let i = 0; i < 26; i++) {
        const a = r() * Math.PI * 2, k = Math.pow(r(), 0.6);
        spots.push([ru.x + Math.cos(a) * 0.66, ru.y + ru.h - k * ru.h * 0.9, ru.z + Math.sin(a) * 0.66, 0.26 + r() * 0.16]);
      }
    }
  }
  if (!spots.length) return;
  const g = leafCardGeo();
  const inst = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.75 }), spots.length);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sv = new THREE.Vector3(), e = new THREE.Euler(), c = new THREE.Color();
  spots.forEach(([x, y, z, sz], i) => {
    m4.compose(v.set(x, y, z), q.setFromEuler(e.set(r() * 6, r() * 6, r() * 6)), sv.set(sz, sz, sz));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.setHSL(0.27 + r() * 0.05, 0.5, 0.32 + r() * 0.12));
  });
  inst.castShadow = true; inst.userData.noOutline = true;
  scene.add(inst);
}

export function buildRuins(scene) {
  const out = [];
  const mat = stoneMat();
  const vineMat = M.mat(0x4c9a34, { roughness: 0.8 });
  let seed = 3;
  for (const ru of L.ruins) {
    seed++;
    if (ru.type === 'pillar') {
      const m = new THREE.Mesh(pillarGeo(ru.h + 1, ru.broken, seed), mat);
      m.position.set(ru.x, ru.y - 1, ru.z);
      m.rotation.y = seed;
      m.castShadow = m.receiveShadow = true;
      scene.add(m); out.push(m);
      if (!ru.broken) {
        const v = new THREE.Mesh(M.mergeGeos([0, 1, 2].map(k => ({ geo: vine(Math.cos(k * 2 + seed) * 0.56, ru.h + 0.6, Math.sin(k * 2 + seed) * 0.56, 1 + k * 0.6, seed + k) }))), vineMat);
        v.position.set(ru.x, ru.y - 1, ru.z);
        scene.add(v);
      }
    } else if (ru.type === 'arch') {
      const g = new THREE.BoxGeometry(ru.span + 1.6, 0.9, 1.3, 8, 1, 1);
      const p = g.attributes.position, uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setY(i, p.getY(i) + Math.cos((x / (ru.span / 2 + 0.8)) * Math.PI / 2) * 0.6); uv.setXY(i, (x + 4) / 2.5, (p.getY(i) + 1) / 1.4); }
      g.computeVertexNormals();
      const m = new THREE.Mesh(mossy(g, 1.1, -0.45), mat);
      m.position.set(ru.x, ru.y + 0.35, ru.z);
      m.castShadow = m.receiveShadow = true;
      scene.add(m); out.push(m);
      const v = new THREE.Mesh(M.mergeGeos([-2, -0.8, 0.6, 1.9].map((k, i) => ({ geo: vine(k, 0.0, 0.66 * (i % 2 ? 1 : -1), 0.8 + (i % 3) * 0.5, seed + i) }))), vineMat);
      v.position.set(ru.x, ru.y + 0.35, ru.z);
      scene.add(v);
    } else if (ru.type === 'wall') {
      const g = new THREE.BoxGeometry(ru.w, ru.h + 1, ru.d, Math.round(ru.w * 2), 2, Math.round(ru.d * 2));
      const r = rng(seed * 7);
      const p = g.attributes.position, uv = g.attributes.uv, n = g.attributes.normal;
      const top = (ru.h + 1) / 2;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        // dessus un peu écroulé (sans descendre sous la hauteur où l'on marche)
        if (y > top - 0.01) p.setY(i, top + 0.08 - Math.abs(Math.sin((x + z) * 1.7 + seed)) * 0.22 - r() * 0.06);
        uv.setXY(i, (Math.abs(n.getX(i)) > 0.5 ? z : x) / 1.4, (p.getY(i) + 2) / 1.4);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(mossy(g, top, -top), mat);
      m.position.set(ru.x, ru.y - 1 + (ru.h + 1) / 2, ru.z);
      m.castShadow = m.receiveShadow = true;
      scene.add(m); out.push(m);
    }
  }
  if (LOOK.real) buildIvy(scene);
  return out;
}

/** Chemins pavés : rubans de dalles qui épousent le terrain. */
/** Chemin réaliste : petits pavés usés, terre et mousse dans les joints, bords qui s'effilochent. */
function realPavingTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  const r = rng(29);
  // terre battue dans les joints (et sur les bords)
  for (let i = 0; i < 2600; i++) {
    const px = r() * 256, edge = Math.min(px, 256 - px) / 128;
    if (r() > 0.25 + edge * 1.4) continue;
    x.fillStyle = `rgba(${110 + r() * 30 | 0},${90 + r() * 20 | 0},${62 + r() * 15 | 0},${0.5 + r() * 0.4})`;
    x.beginPath(); x.arc(px, r() * 512, 2 + r() * 5, 0, 7); x.fill();
  }
  const rows = 26, rh = 512 / rows;
  for (let j = 0; j < rows; j++) {
    let px = -r() * 12;
    while (px < 256) {
      const w = rh * (0.9 + r() * 0.7);
      const edge = Math.min(px + w / 2, 256 - px - w / 2) / 128;
      if (r() < 0.12 + edge * 1.5) {
        const l = 140 + Math.floor(r() * 55), warm = r() * 12;
        x.fillStyle = `rgb(${l + warm | 0},${l - 2 | 0},${l - 12 - warm | 0})`;
        x.beginPath(); x.roundRect(px + 1.5, j * rh + 1.5, w - 3, rh - 3, 4); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.12)'; x.fillRect(px + 3, j * rh + 2, w * 0.6, 3);
        x.fillStyle = 'rgba(40,30,20,0.18)'; x.fillRect(px + 3, j * rh + rh - 5, w - 6, 3);
        if (r() < 0.2) { x.fillStyle = 'rgba(90,120,50,0.45)'; x.beginPath(); x.arc(px + r() * w, j * rh + r() * rh, 2 + r() * 4, 0, 7); x.fill(); }
      }
      px += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
/** Chemin en vraies pierres (photo), bords irréguliers qui se perdent dans l'herbe. */
function photoPavingTexture() {
  const im = RT.photoImage('stone_pathway_d');
  const c = document.createElement('canvas'); c.width = 256; c.height = 512;
  const x = c.getContext('2d');
  x.drawImage(im, 0, 0, 256, 256); x.drawImage(im, 0, 256, 256, 256);
  // bords : effacés de façon irrégulière
  const r = rng(13);
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 900; i++) {
    const side = r() < 0.5, d = Math.pow(r(), 1.8) * 70;
    const px = side ? d : 256 - d, py = r() * 512;
    x.fillStyle = `rgba(0,0,0,${0.5 + (1 - d / 70) * 0.5})`;
    x.beginPath(); x.arc(px, py, 4 + r() * 10, 0, 7); x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
function pavingTexture() {
  if (LOOK.real && RT.hasPhotos()) return photoPavingTexture();
  if (LOOK.real) return realPavingTexture();
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  const r = rng(17);
  // dalles irrégulières, bords qui se perdent dans l'herbe
  for (let j = 0; j < 9; j++) {
    let px = r() * 10 - 10;
    while (px < 128) {
      const w = 26 + r() * 26, h = 22 + r() * 10, y = j * 29 + r() * 4;
      const edge = Math.min(px + w / 2, 128 - px - w / 2) / 64;
      if (r() < 0.25 + edge * 1.2) {
        const l = 150 + Math.floor(r() * 40);
        x.fillStyle = `rgb(${l + 10},${l - 4},${l - 30})`;
        x.beginPath(); x.roundRect(px + 2, y, w - 4, h, 7); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.15)'; x.fillRect(px + 5, y + 2, w - 10, 3);
        x.fillStyle = 'rgba(80,60,40,0.18)'; x.fillRect(px + 5, y + h - 5, w - 10, 3);
      }
      px += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function buildPaths(scene) {
  if (!L.PATHS.length) return null;
  const tex = pavingTexture();
  const geos = [];
  for (const [[ax, az], [bx, bz]] of L.PATHS) {
    const len = Math.hypot(bx - ax, bz - az), n = Math.ceil(len / 0.6);
    const dx = (bx - ax) / len, dz = (bz - az) / len, nx = -dz, nz = dx, W = 1.7;
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, cx = ax + (bx - ax) * t, cz = az + (bz - az) * t;
      for (const s of [-1, 0, 1]) {
        const x = cx + nx * W * s, z = cz + nz * W * s;
        pos.push(x, Math.max(L.heightAt(x, z), -0.5) + 0.07, z);
        uv.push((s + 1) / 2, (t * len) / 3.4);
      }
      if (i < n) for (const o of [0, 1]) { const a = i * 3 + o; idx.push(a, a + 1, a + 3, a + 1, a + 4, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    geos.push(g);
  }
  // fusion simple
  const all = M.mergeGeos(geos.map(geo => ({ geo })));
  const uvs = []; for (const g of geos) { const u = g.attributes.uv, id = g.index; for (let i = 0; i < id.count; i++) uvs.push(u.getX(id.getX(i)), u.getY(id.getX(i))); }
  all.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  const m = new THREE.Mesh(all, new THREE.MeshStandardMaterial({ map: tex, normalMap: LOOK.real ? RT.normalFor(tex, 5) : null, transparent: true, alphaTest: 0.4, roughness: 0.85, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.receiveShadow = true;
  scene.add(m);
  return m;
}

/** Cristaux lumineux (turquoise et violets). */
export function buildCrystals(scene) {
  const spots = L.CRYSTALS;
  const out = [];
  const glow = M.glowTexture();
  spots.forEach(([x, z, col], i) => {
    const r = rng(200 + i);
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.9, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.88 });
    const k = 3 + Math.floor(r() * 3);
    for (let j = 0; j < k; j++) {
      const h = 0.6 + r() * 1.1;
      const c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), mat);
      c.scale.set(0.18 + r() * 0.08, h, 0.18 + r() * 0.08);
      c.position.set((r() - 0.5) * 0.7, h * 0.6, (r() - 0.5) * 0.7);
      c.rotation.set((r() - 0.5) * 0.7, r() * 3, (r() - 0.5) * 0.7);
      g.add(c);
    }
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    s.scale.set(3.2, 3.2, 1); s.position.y = 0.8; g.add(s);
    const y = L.supportAt(x, z, 99, 0, 0).y;
    g.position.set(x, y - 0.1, z);
    scene.add(g);
    out.push(g);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Feuillage peint : un cœur rond + des cartes de feuilles orientées vers l'extérieur
// ---------------------------------------------------------------------------
let leafTex = null;
export function leafTexture() {
  if (leafTex) return leafTex;

  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const r = rng(55);
  const leaf = (cx, cy, s, a) => {
    x.save(); x.translate(cx, cy); x.rotate(a);
    const l = 0.75 + r() * 0.45;
    x.fillStyle = `rgb(${Math.round(105 * l)},${Math.round(185 * l)},${Math.round(62 * l)})`;
    x.beginPath(); x.ellipse(0, 0, s * 0.45, s, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,200,0.18)'; x.beginPath(); x.ellipse(-s * 0.12, -s * 0.3, s * 0.15, s * 0.45, 0, 0, 7); x.fill();
    x.restore();
  };
  // moitié gauche : feuillage dense opaque (pour le cœur)
  x.fillStyle = '#5ea83e'; x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 260; i++) leaf(r() * 128, r() * 128, 6 + r() * 5, r() * 7);
  // moitié droite : touffe de feuilles détourée (pour les cartes)
  for (let i = 0; i < 140; i++) {
    const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 50;
    leaf(192 + Math.cos(a) * d, 64 + Math.sin(a) * d, 6 + r() * 6, a + Math.PI / 2 + (r() - 0.5));
  }
  leafTex = new THREE.CanvasTexture(c);
  leafTex.colorSpace = THREE.SRGBColorSpace;
  leafTex.anisotropy = 4;
  return leafTex;
}

/**
 * Géométrie d'une touffe de feuillage (rayon ~1) : un amas de boules lisses
 * (style dessin animé), plus claires en haut et plus sombres dessous.
 */
export function leafClusterGeo(detail) {
  const lite = detail <= 10, tiny = detail <= 6;
  const r = rng(77);
  const parts = [{ geo: new THREE.IcosahedronGeometry(0.78, tiny ? 1 : lite ? 2 : 3) }];
  const n = 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + r() * 0.4, up = 0.15 + r() * 0.35;
    const rad = 0.42 + r() * 0.14;
    parts.push({ geo: new THREE.IcosahedronGeometry(rad, tiny ? 0 : lite ? 1 : 2), x: Math.cos(a) * 0.62, y: up, z: Math.sin(a) * 0.62 });
    if (tiny) k++;            // moitié moins de petites touffes
  }
  parts.push({ geo: new THREE.IcosahedronGeometry(0.5, tiny ? 0 : lite ? 1 : 2), y: 0.62, x: 0.05 });
  // normales rondes (même sur les touffes à peu de faces : pas d'aspect taillé à facettes)
  for (const pt of parts) { const gp = pt.geo.attributes.position, gn = pt.geo.attributes.normal, v = new THREE.Vector3(); for (let i = 0; i < gp.count; i++) { v.fromBufferAttribute(gp, i).normalize(); gn.setXYZ(i, v.x, v.y, v.z); } }
  const g = M.mergeGeos(parts);
  const p = g.attributes.position, nrm = g.attributes.normal;
  if (LOOK.real) {
    // silhouette bosselée : chaque touffe gonfle et se creuse un peu (moins « boule »)
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const n = Math.sin(x * 5.1 + z * 2.3) * Math.cos(y * 4.7 - x * 1.9) * 0.5 + Math.sin((x + y + z) * 9.3) * 0.25;
      const k = 1 + n * 0.16;
      p.setXYZ(i, x * k, y * k, z * k);
    }
  }
  const col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const t = smooth(-0.9, 0.9, p.getY(i)) * 0.6 + smooth(-0.5, 1, nrm.getY(i)) * 0.4;
    const k = 0.62 + 0.45 * t;
    col[i * 3] = k; col[i * 3 + 1] = k; col[i * 3 + 2] = Math.min(1, k * 0.95);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
let leafM = null;
/** Motif de petites feuilles (gris : la couleur vient de l'arbre), projeté sur les couronnes. */
function leafPatternTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#3a3a3a'; x.fillRect(0, 0, 256, 256);
  const r = rng(808);
  for (let i = 0; i < 1100; i++) {
    const v = 120 + Math.floor(r() * 135);
    x.fillStyle = `rgb(${v},${v},${v})`;
    x.save(); x.translate(r() * 256, r() * 256); x.rotate(r() * 6.28);
    x.beginPath(); x.ellipse(0, 0, 3 + r() * 2.5, 7 + r() * 4, 0, 0, 7); x.fill();
    x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(-0.5, -6, 1, 12);
    x.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
export function leafMaterial() {
  if (leafM) return leafM;
  leafM = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  leafM.name = 'leaves';
  if (LOOK.real) {
    const tex = leafPatternTexture(), nrm = RT.normalFor(tex, 3);
    leafM.onBeforeCompile = (sh) => {
      sh.uniforms.uLeaf = { value: tex }; sh.uniforms.uLeafN = { value: nrm };
      sh.vertexShader = 'varying vec3 vLeafP;\nvarying vec3 vLeafN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        vec4 lp = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          lp = instanceMatrix * lp;
        #endif
        vLeafP = (modelMatrix * lp).xyz;
        vLeafN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = 'uniform sampler2D uLeaf;\nvarying vec3 vLeafP;\nvarying vec3 vLeafN;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bw = pow(abs(vLeafN), vec3(4.0)); bw /= (bw.x + bw.y + bw.z);
        vec3 q = vLeafP * 0.9;
        float leaf = texture2D(uLeaf, q.yz).r * bw.x + texture2D(uLeaf, q.xz).r * bw.y + texture2D(uLeaf, q.xy).r * bw.z;
        diffuseColor.rgb *= 0.45 + leaf * 1.05;`);
    };
    leafM.customProgramCacheKey = () => 'leafy';
  }
  return leafM;
}
export function leafDepthMaterial() {
  return new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
}

// ---------------------------------------------------------------------------
// Nuages peints (grands panneaux toujours face à la caméra)
// ---------------------------------------------------------------------------
function cloudTexture(seed) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  const r = rng(seed);
  const puffs = [];
  for (let i = 0; i < 14; i++) puffs.push([40 + r() * 176, 70 + (r() - 0.5) * 30 - Math.sin((i / 14) * Math.PI) * 18, 18 + r() * 26]);
  // ombre bleutée en bas, puis le blanc par-dessus, décalé vers le haut
  for (const [px, py, pr] of puffs) {
    const g = x.createRadialGradient(px, py + 6, pr * 0.2, px, py + 6, pr);
    g.addColorStop(0, 'rgba(176,196,226,0.95)'); g.addColorStop(1, 'rgba(176,196,226,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py + 6, pr, 0, 7); x.fill();
  }
  for (const [px, py, pr] of puffs) {
    const g = x.createRadialGradient(px - pr * 0.2, py - pr * 0.3, pr * 0.1, px, py - 2, pr * 0.85);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(250,252,255,0.9)'); g.addColorStop(1, 'rgba(250,252,255,0)');
    x.fillStyle = g; x.beginPath(); x.arc(px, py - 2, pr * 0.85, 0, 7); x.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function buildPaintedClouds(scene) {
  const out = [];
  const texs = [cloudTexture(3), cloudTexture(8), cloudTexture(21)];
  const r = rng(13);
  for (let i = 0; i < 14; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: texs[i % 3], transparent: true, depthWrite: false, fog: false }));
    const w = 90 + r() * 90;
    s.scale.set(w, w * 0.5, 1);
    const a = (i / 14) * Math.PI * 2 + r() * 0.3;
    s.userData = { a, r: 300 + r() * 80, y: 38 + r() * 55 };
    s.position.set(Math.cos(a) * s.userData.r, s.userData.y, Math.sin(a) * s.userData.r);
    s.renderOrder = -5;
    scene.add(s);
    out.push(s);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Panorama lointain : chaînes de montagnes bleutées, château, îles flottantes
// ---------------------------------------------------------------------------
const HAZE = new THREE.Color(0x9cc2ea);
function hazeMat() { return new THREE.MeshLambertMaterial({ vertexColors: true, fog: false, emissive: HAZE, emissiveIntensity: 0.18 }); }

// bruit de valeur 3D (relief des montagnes)
function mh(x, y, z) { let h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function mnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(mh(ix, iy, iz), mh(ix + 1, iy, iz), fx), l(mh(ix, iy + 1, iz), mh(ix + 1, iy + 1, iz), fx), fy),
           l(l(mh(ix, iy, iz + 1), mh(ix + 1, iy, iz + 1), fx), l(mh(ix, iy + 1, iz + 1), mh(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
/** Montagne réaliste : crêtes et ravines (bruit « ridged »), forêt en bas, roche, neige. */
function realMountainGeo(seed, rad, h, snow, hazeK) {
  const r = rng(seed);
  const g = new THREE.ConeGeometry(rad, h, 88, 36);
  const p = g.attributes.position;
  const o = [r() * 50, r() * 50, r() * 50], f = 3.2 / rad;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (y + h / 2) / h, a = Math.atan2(z, x);
    let ridge = 0, amp = 1, fr = 1, sum = 0;
    for (let k = 0; k < 5; k++) {
      const nv = 1 - Math.abs(mnoise(x * f * fr + o[0], y * f * fr * 1.6 + o[1], z * f * fr + o[2]) * 2 - 1);
      ridge += nv * nv * amp; sum += amp; amp *= 0.5; fr *= 2.1;
    }
    ridge /= sum;
    const k = 0.72 + 0.16 * Math.sin(a * 2 + o[0]) + ridge * 0.5 * (1 - t * 0.4);
    p.setXYZ(i, x * k, y + (ridge - 0.5) * h * 0.18 * (1 - t), z * k);
  }
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  const n = g.attributes.normal;
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  const forest = new THREE.Color(0x3d5e3a), rock = new THREE.Color(0x77736c), dark = new THREE.Color(0x4f4c48), white = new THREE.Color(0xf2f6fc);
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h, steep = 1 - Math.max(0, n.getY(i));
    const nv = mnoise(p.getX(i) * 0.08, p.getY(i) * 0.08, p.getZ(i) * 0.08);
    c.copy(rock).lerp(dark, smooth(0.3, 0.7, steep) * 0.7 + (nv - 0.5) * 0.3);
    c.lerp(forest, smooth(0.42, 0.18, t + (nv - 0.5) * 0.15) * (1 - smooth(0.55, 0.85, steep) * 0.6));
    if (snow) c.lerp(white, smooth(0.55, 0.68, t + (nv - 0.5) * 0.12 - steep * 0.15));
    c.lerp(HAZE, hazeK * (1 - t * 0.25));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function mountainGeo(seed, rad, h, snow, hazeK) {
  if (LOOK.real) return realMountainGeo(seed, rad, h, snow, hazeK);
  const r = rng(seed);
  const g = new THREE.ConeGeometry(rad, h, 18, 8);
  const p = g.attributes.position;
  const off = r() * 10;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + 0.18 * Math.sin(a * 3 + off) + 0.1 * Math.sin(a * 7 + off * 2) + 0.06 * Math.sin(y * 0.3 + a * 5);
    p.setXYZ(i, x * k, y + (y < h / 2 - 1 ? Math.sin(a * 5 + off) * h * 0.04 : 0), z * k);
  }
  g.computeVertexNormals();
  g.translate(0, h / 2, 0);
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  const rock = new THREE.Color(0x6f86a8), green = new THREE.Color(0x4f8a5a), white = new THREE.Color(0xf4f8ff);
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) / h;
    c.copy(green).lerp(rock, smooth(0.15, 0.5, t));
    if (snow) c.lerp(white, smooth(0.62, 0.72, t + Math.sin(p.getX(i) * 0.2) * 0.04));
    c.lerp(HAZE, hazeK * (1 - t * 0.3));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

function castleGeo() {
  const parts = [];
  const tower = (x, z, r, h, roofH) => {
    parts.push({ geo: new THREE.CylinderGeometry(r, r * 1.05, h, 12), x, y: h / 2, z, col: 0xd8d4e0 });
    parts.push({ geo: new THREE.ConeGeometry(r * 1.35, roofH, 12), x, y: h + roofH / 2, z, col: 0x3a5ab0 });
  };
  parts.push({ geo: new THREE.BoxGeometry(34, 12, 16), y: 6, col: 0xc8c4d4 });
  tower(0, 0, 4.2, 34, 16); tower(-12, 4, 3, 24, 11); tower(12, 4, 3, 26, 12); tower(-17, -5, 2.4, 18, 9); tower(17, -5, 2.4, 20, 9); tower(5, -6, 2, 30, 10);
  const geos = parts.map(({ geo, col }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const c = new THREE.Color(col).lerp(HAZE, 0.45);
    const a = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  return M.mergeGeos(parts.map((p, i) => ({ geo: geos[i], x: p.x, y: p.y, z: p.z })));
}

function floatingIsland(seed, rad, fallTex) {
  const r = rng(seed);
  const g = new THREE.Group();
  const rock = new THREE.ConeGeometry(rad, rad * 1.8, 14, 5);
  rock.rotateX(Math.PI);
  const p = rock.attributes.position;
  for (let i = 0; i < p.count; i++) { const k = 1 + (r() - 0.5) * 0.25; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
  rock.computeVertexNormals();
  rock.translate(0, -rad * 0.9, 0);
  const col = new Float32Array(p.count * 3), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const t = -p.getY(i) / (rad * 1.8);
    c.set(0x8a7a6a).lerp(new THREE.Color(0x5a5a6a), t).lerp(HAZE, 0.25);
    if (t < 0.06) c.set(0x6aa848).lerp(HAZE, 0.2);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  rock.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.add(new THREE.Mesh(rock, hazeMat()));
  const top = new THREE.Mesh(new THREE.CylinderGeometry(rad * 1.02, rad, 0.8, 18), new THREE.MeshLambertMaterial({ color: new THREE.Color(0x78c04c).lerp(HAZE, 0.2), fog: false }));
  top.position.y = 0.1; g.add(top);
  const leaves = new THREE.MeshLambertMaterial({ color: new THREE.Color(0x4c9a3a).lerp(HAZE, 0.25), fog: false });
  for (let i = 0; i < 3 + Math.floor(rad / 4); i++) {
    const a = r() * 6.28, d = r() * rad * 0.6, s = 1.5 + r() * 2;
    const t = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), leaves);
    t.position.set(Math.cos(a) * d, s * 1.2, Math.sin(a) * d); g.add(t);
  }
  // cascade qui tombe dans le vide
  const fall = new THREE.Mesh(new THREE.PlaneGeometry(rad * 0.35, rad * 3.2), new THREE.MeshBasicMaterial({ map: fallTex, transparent: true, opacity: 0.75, depthWrite: false, fog: false, alphaMap: fadeTexture() }));
  const fa = r() * 6.28;
  fall.position.set(Math.cos(fa) * rad * 0.98, -rad * 1.6 + 0.4, Math.sin(fa) * rad * 0.98);
  fall.rotation.y = -fa + Math.PI / 2;
  g.add(fall);
  return g;
}
let fadeTex = null;
function fadeTexture() {
  if (fadeTex) return fadeTex;
  const c = document.createElement('canvas'); c.width = 4; c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#bbb'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 4, 64);
  fadeTex = new THREE.CanvasTexture(c);
  return fadeTex;
}

export function buildVista(scene, fallTex) {
  const group = new THREE.Group();
  const r = rng(404);
  // deux chaînes : la plus lointaine est la plus bleutée
  for (const [dist, count, hz, hMin, hMax] of [[520, 16, 0.7, 50, 105], [380, 18, 0.5, 22, 48]]) {
    const geos = [];
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + r() * 0.2;
      const h = hMin + r() * (hMax - hMin);
      geos.push({ geo: mountainGeo(500 + i + dist, h * (1.1 + r() * 0.6), h, h > 80, hz), x: Math.cos(a) * dist, y: -6, z: Math.sin(a) * dist });
    }
    group.add(new THREE.Mesh(M.mergeGeos(geos), hazeMat()));
  }
  // château perché au nord-ouest, sur un éperon rocheux
  const spur = new THREE.Mesh(mountainGeo(77, 40, 55, false, 0.4), hazeMat());
  spur.position.set(-150, -8, -330); spur.scale.set(1, 1, 0.7);
  group.add(spur);
  const castle = new THREE.Mesh(castleGeo(), hazeMat());
  castle.position.set(-150, 44, -330); castle.rotation.y = 0.5;
  group.add(castle);
  // îles flottantes
  const isles = [];
  for (const [x, y, z, rad, seed] of (L.WORLD ? [] : [[95, 38, -150, 9, 1], [150, 62, -60, 6, 2], [-160, 46, -95, 8, 3], [60, 70, -210, 5, 4], [-80, 30, 150, 7, 5], [140, 30, 110, 6, 6]])) {
    const isl = floatingIsland(seed, rad, fallTex);
    isl.position.set(x, y, z);
    isl.userData.y0 = y;
    group.add(isl);
    isles.push(isl);
  }
  group.traverse(o => { o.frustumCulled = false; });
  scene.add(group);
  return { group, isles };
}
