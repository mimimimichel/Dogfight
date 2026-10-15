/*
 * Matcha & Ainu — conifères « vrais » : branches en cartes texturées d'après un sapin scanné
 * (Poly Haven fir_tree_01, CC0), tronc en écorce photo, neige qui se pose sur le dessus des
 * branches (dans le shader, d'après l'orientation), léger balancement au vent.
 * Une géométrie de quelques centaines de triangles, dessinée en InstancedMesh : assez léger pour
 * des centaines de sapins sur téléphone.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as RT from './realtex.js';

export const FIR_IMAGES = ['fir_twigs', 'fir_twigs_n', 'fir_bark', 'fir_bark_n'];
export const hasFir = () => FIR_IMAGES.every(k => RT.photoImage(k));

// cases de l'atlas (2 × 2) : u0, v0 (bas), taille ; la tige est en bas au milieu de la case
const CELLS = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]];
const PATCH = [0.97, 0.53];   // petit carré d'aiguilles opaque (cœur du sapin)

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * Géométrie d'un sapin (hauteur ~6,2 m à l'échelle 1, pied en y = 0).
 * Deux groupes : 0 = tronc (écorce), 1 = branches et cœur (atlas d'aiguilles).
 */
export function firGeometry(seed = 1, opts = {}) {
  const r = rng(seed * 7919 + 13);
  const H = opts.height || 6.2, R0 = opts.radius || 2.1, levels = opts.levels || 10;
  const pos = [], nor = [], uv = [], col = [], idxT = [], idxB = [];
  let n = 0;
  const v = (x, y, z, nx, ny, nz, u, w, c, list) => { pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(u, w); col.push(c, c, c); return n++; };
  // tronc : cylindre effilé (écorce répétée)
  {
    const seg = 7, h = H * 0.92;
    for (let j = 0; j <= 2; j++) {
      const y = h * j / 2, rad = 0.24 * (1 - j / 2) + 0.04;
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; v(Math.cos(a) * rad, y, Math.sin(a) * rad, Math.cos(a), 0, Math.sin(a), i / seg * 2, y / 1.4, 0.8, idxT); }
    }
    for (let j = 0; j < 2; j++) for (let i = 0; i < seg; i++) { const a = j * (seg + 1) + i, b = a + seg + 1; idxT.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const t0 = n;
  // cœur : un cône sombre plein (bouche les trous entre les branches, vu de loin)
  {
    const seg = 8, y0 = H * 0.17, y1 = H * 0.95, rc = R0 * 0.38;
    const base = n;
    for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); v(c * rc, y0, s * rc, c * 0.8, 0.45, s * 0.8, PATCH[0], PATCH[1], 0.5, idxB); }
    const tip = v(0, y1, 0, 0, 1, 0, PATCH[0], PATCH[1], 0.55, idxB);
    for (let i = 0; i < seg; i++) idxB.push(base + i, tip, base + i + 1);
  }
  // étages de branches
  const golden = 2.39996;
  let ang = r() * 6.28;
  for (let k = 0; k < levels; k++) {
    const f = k / (levels - 1);                      // 0 en bas, 1 en haut
    const y = H * (0.16 + 0.76 * f) + (r() - 0.5) * 0.15;
    const len = (R0 * Math.pow(1 - f, 0.85) + 0.35) * (0.92 + r() * 0.16);
    const count = Math.max(5, Math.round(13 - f * 7));
    for (let b = 0; b < count; b++) {
      ang += golden + (r() - 0.5) * 0.3;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const droop = 0.22 + f * -0.1 + (1 - f) * 0.18 + (r() - 0.5) * 0.12;   // les branches basses tombent plus
      const L = len * (0.85 + r() * 0.3), Wd = L * (0.95 + r() * 0.2), lift = 0.32;  // demi-ailes relevées (carte en V)
      const cell = CELLS[(r() * 4) | 0];
      // repère de la branche : a = vers l'extérieur (penché), s = côté, up = normale
      const ax = ca * Math.cos(droop), ay = -Math.sin(droop), az = sa * Math.cos(droop);
      const sx = -sa, sz = ca;
      const ux = -ca * Math.sin(droop), uy = Math.cos(droop), uz = -sa * Math.sin(droop);
      const bx = ca * 0.12, bz = sa * 0.12;   // part du tronc
      const pt = (t, w) => {                  // t : 0 tige → 1 pointe ; w : -1..1 en travers
        const wl = Math.abs(w);
        return [bx + ax * L * t + sx * Wd * 0.5 * w + ux * Wd * 0.5 * wl * lift,
          y + ay * L * t + uy * Wd * 0.5 * wl * lift - t * t * L * 0.08,
          bz + az * L * t + sz * Wd * 0.5 * w + uz * Wd * 0.5 * wl * lift];
      };
      // normales « arrondies » : vers l'extérieur et le haut (ombrage doux de la silhouette)
      const nn = (t) => { const ox = ca * (0.35 + t * 0.5), oz = sa * (0.35 + t * 0.5), oy = 0.75 - f * 0.1; const l = Math.hypot(ox, oy, oz); return [ox / l, oy / l, oz / l]; };
      const u0 = cell[0], v0 = cell[1];
      const shadeIn = 0.62 + f * 0.15, shadeOut = 1.0;
      const rows = [[0, shadeIn], [1, shadeOut]];
      const ids = [];
      for (const [t, c] of rows) for (const w of [-1, 0, 1]) {
        const p = pt(t, w), q = nn(t);
        ids.push(v(p[0], p[1], p[2], q[0], q[1], q[2], u0 + 0.25 + w * 0.25, v0 + t * 0.5 * 0.985, c, idxB));
      }
      // 2 × 2 triangles (la carte pliée le long de la tige)
      idxB.push(ids[0], ids[3], ids[1], ids[1], ids[3], ids[4], ids[1], ids[4], ids[2], ids[2], ids[4], ids[5]);
    }
  }
  // cime : deux cartes verticales croisées
  {
    const cell = CELLS[0], h0 = H * 0.86, h1 = H * 1.04, wd = 0.55;
    for (const a of [0, Math.PI / 2]) {
      const c = Math.cos(a) * wd, s = Math.sin(a) * wd;
      const i0 = v(-c, h0, -s, 0, 0.6, 0.8, cell[0], cell[1], 0.9, idxB), i1 = v(c, h0, s, 0, 0.6, 0.8, cell[0] + 0.5, cell[1], 0.9, idxB);
      const i2 = v(-c, h1, -s, 0, 0.9, 0.4, cell[0], cell[1] + 0.49, 1, idxB), i3 = v(c, h1, s, 0, 0.9, 0.4, cell[0] + 0.5, cell[1] + 0.49, 1, idxB);
      idxB.push(i0, i1, i2, i2, i1, i3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex([...idxT, ...idxB]);
  g.addGroup(0, idxT.length, 0);
  g.addGroup(idxT.length, idxB.length, 1);
  g.computeBoundingSphere();
  g.userData.trunkVerts = t0;
  return g;
}

const texCache = {};
function tex(key, srgb, repeat) {
  if (texCache[key]) return texCache[key];
  const im = RT.photoImage(key); if (!im) return null;
  const t = new THREE.Texture(im);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4; t.needsUpdate = true;
  return (texCache[key] = t);
}

/** Uniformes partagés (temps pour le vent). */
export const FOLIAGE = { uTime: { value: 0 } };
export function tickFoliage(t) { FOLIAGE.uTime.value = t; }

/**
 * Matériaux [écorce, aiguilles]. opts.snow (0..1) : quantité de neige posée sur les branches.
 * opts.lite : téléphone (pas de carte de relief sur les aiguilles).
 */
export function firMaterials(opts = {}) {
  const snow = opts.snow || 0;
  const bark = new THREE.MeshStandardMaterial({ map: tex('fir_bark', true, true), normalMap: tex('fir_bark_n', false, true), roughness: 0.95, vertexColors: true });
  const needles = new THREE.MeshStandardMaterial({
    map: tex('fir_twigs', true), normalMap: opts.lite ? null : tex('fir_twigs_n', false), roughness: 0.85,
    vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide,
  });
  needles.normalScale = new THREE.Vector2(0.6, 0.6);
  needles.color.setScalar(1.45);   // l'atlas est sombre (aiguilles) : on éclaircit un peu
  needles.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = FOLIAGE.uTime; sh.uniforms.uSnow = { value: snow };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nvarying float vSnowUp;\nvarying vec3 vWPos;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          // vent : les bouts de branches (loin de l'axe) et le haut bougent un peu
          vec4 wp0 = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #ifdef USE_INSTANCING
            wp0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
          #endif
          float ph = wp0.x * 0.37 + wp0.z * 0.23;
          float reach = length(transformed.xz) * 0.08 + transformed.y * 0.012;
          transformed.x += sin(uTime * 1.3 + ph + transformed.y * 0.4) * reach * 0.6;
          transformed.z += cos(uTime * 1.1 + ph * 1.3) * reach * 0.4;
          transformed.y += sin(uTime * 2.1 + ph + transformed.x) * reach * 0.25;
        }`)
      .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
        {
          vec3 nW = normalize(mat3(modelMatrix) * objectNormal);
          #ifdef USE_INSTANCING
            nW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * objectNormal);
          #endif
          vSnowUp = nW.y;
          vec4 wq = modelMatrix * vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wq = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
          #endif
          vWPos = wq.xyz;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uSnow;\nvarying float vSnowUp;\nvarying vec3 vWPos;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (uSnow > 0.0) {
          // neige : sur ce qui regarde vers le ciel, en taches irrégulières, plus au bout des branches
          float nz = fract(sin(dot(floor(vWPos.xz * 3.1 + vWPos.y * 1.7), vec2(12.9898, 78.233))) * 43758.5453);
          float s = smoothstep(0.5, 0.85, vSnowUp + nz * 0.3 - 0.12) * uSnow;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 1.0), s);
        }`);
  };
  needles.customProgramCacheKey = () => 'fir-needles-' + (snow > 0 ? 's' : 'n') + (opts.lite ? 'l' : 'h');
  return [bark, needles];
}
