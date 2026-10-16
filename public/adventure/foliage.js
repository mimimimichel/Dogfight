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

/** Uniformes partagés (temps pour le vent ; teinte des feuillus, pour les saisons). */
export const FOLIAGE = { uTime: { value: 0 }, uTint: { value: new THREE.Color(1, 1, 1) } };
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

// =============================================================================
// Feuillus : arbres ronds, cerisiers en fleurs, pommiers, buissons
// (rameaux de vraies feuilles scannées — Poly Haven island_tree_01 et shrub_01, CC0 —
//  posés en cartes autour de chaque couronne ; écorce photo bark_willow_02)
// =============================================================================
export const hasBroadleaf = () => !!(RT.photoImage('broadleaf') && RT.photoImage('bark_willow_02_d'));

// cases de l'atlas broadleaf.webp (u0, v0 en bas, taille) — voir tools/polyhaven/broadleaf.py
const BL = {
  oval: [0, 0.5, 0.5], serr: [0.5, 0.5, 0.5], cherry: [0, 0, 0.5],
  clumpOval: [0.5, 0, 0.25], clumpSerr: [0.75, 0, 0.25],
};
const CORE = { green: [0.625, 0.375], pink: [0.875, 0.375] };   // centre des cases de feuillage dense (opaque)

/**
 * Espèces (repère de référence : pied en y = 0).
 * yF : fourche (au-dessus, la couronne garde ses proportions quel que soit l'étirement du tronc)
 * C, R : hauteur du centre et rayons de la couronne ; cards : nombre de rameaux ; size : longueur d'un rameau
 */
export const SPECIES = {
  round: { top: 0.85, yF: 3.0, C: 5.7, R: [2.8, 2.5, 2.8], cards: 84, size: [1.2, 1.7], cell: ['oval', 'oval', 'serr'], core: 'green', limbs: 4, trunkR: 0.3 },
  cherry: { top: 0.9, yF: 2.4, C: 4.6, R: [3.0, 1.9, 3.0], cards: 76, size: [1.2, 1.6], cell: ['cherry'], core: 'pink', limbs: 5, trunkR: 0.26, bark: [0.78, 0.62, 0.6] },
  fruit: { yF: 2.0, C: 5.4, R: [2.6, 2.2, 2.6], cards: 68, size: [1.1, 1.5], cell: ['oval', 'serr'], core: 'green', limbs: 4, trunkR: 0.26, bark: [0.85, 0.8, 0.75] },
};

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

/** Constructeur commun : sommets (position, normale, uv, couleur, fol = [poids couronne, feuille, ancre]). */
function builder() {
  const B = { pos: [], nor: [], uv: [], col: [], fol: [], wood: [], leaf: [], n: 0 };
  B.v = (p, nn, u, w, c, k, leaf, anchor) => {
    B.pos.push(p.x, p.y, p.z); B.nor.push(nn.x, nn.y, nn.z); B.uv.push(u, w);
    if (Array.isArray(c)) B.col.push(c[0], c[1], c[2]); else B.col.push(c, c, c);
    B.fol.push(k, leaf, anchor);
    return B.n++;
  };
  B.geometry = () => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    g.setAttribute('fol', new THREE.Float32BufferAttribute(B.fol, 3));
    g.setIndex([...B.wood, ...B.leaf]);
    if (B.wood.length) { g.addGroup(0, B.wood.length, 0); g.addGroup(B.wood.length, B.leaf.length, 1); }
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  };
  return B;
}

/** Branche : tube effilé (sides côtés) le long d'une suite de points. */
function tube(B, pts, r0, r1, sides, anchor, barkCol) {
  const base = B.n, n = pts.length;
  for (let j = 0; j < n; j++) {
    const p = pts[j], t = j / (n - 1), r = r0 + (r1 - r0) * t;
    const d = (j < n - 1 ? pts[j + 1].clone().sub(p) : p.clone().sub(pts[j - 1])).normalize();
    const a = Math.abs(d.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
    const s1 = a.clone().cross(d).normalize(), s2 = d.clone().cross(s1).normalize();
    for (let i = 0; i <= sides; i++) {
      const ang = i / sides * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
      const nn = s1.clone().multiplyScalar(c).add(s2.clone().multiplyScalar(s));
      B.v(p.clone().addScaledVector(nn, r), nn, i / sides, p.y / 1.6, barkCol, p.y > anchor ? 1 : 0, 0, anchor);
    }
  }
  for (let j = 0; j < n - 1; j++) for (let i = 0; i < sides; i++) {
    const a = base + j * (sides + 1) + i, b = a + sides + 1;
    B.wood.push(a, b, a + 1, a + 1, b, b + 1);
  }
}

/** Cœur sombre et plein de la couronne (on ne voit pas le ciel au travers), normales rondes. */
function core(B, C, R, cellC, anchor, rnd, scale) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.attributes.position, map = new Map(), ids = [];
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(3) + ',' + p.getY(i).toFixed(3) + ',' + p.getZ(i).toFixed(3);
    if (!map.has(key)) {
      const d = v3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
      const bump = 0.82 + rnd() * 0.32;
      const q = v3(C.x + d.x * R[0] * scale * bump, C.y + d.y * R[1] * scale * bump, C.z + d.z * R[2] * scale * bump);
      const sh = 0.72 + 0.3 * (d.y * 0.5 + 0.5);   // (la case dense de l'atlas est déjà sombre)
      // (uv : un petit morceau de la case de feuillage dense)
      const u = cellC[0] + (d.x + d.z * 0.5) * 0.07, w = cellC[1] + (d.y + d.z * 0.3) * 0.07;
      map.set(key, B.v(q, v3(d.x, d.y + 0.25, d.z).normalize(), u, w, sh, 1, 1, anchor));
    }
    ids.push(map.get(key));
  }
  for (let i = 0; i < ids.length; i += 3) B.leaf.push(ids[i], ids[i + 1], ids[i + 2]);
}

/**
 * Rameau : carte texturée (pliée en V le long de la tige) qui part de « from » vers « dir ».
 * Normales arrondies : celles de l'ellipsoïde de la couronne (ombrage doux, comme un volume).
 */
function card(B, from, dir, L, cell, C, R, anchor, rnd, shade) {
  const o = dir.clone().normalize();
  const up = Math.abs(o.y) > 0.92 ? v3(1, 0, 0) : v3(0, 1, 0);
  const side = up.clone().cross(o).normalize().applyAxisAngle(o, (rnd() - 0.5) * 1.6);
  const lift = side.clone().cross(o).normalize();
  const W = L * (0.92 + rnd() * 0.16), fold = 0.22;
  const [u0, v0, sz] = BL[cell];
  const ids = [];
  for (const t of [0, 1]) for (const w of [-1, 0, 1]) {
    const p = from.clone().addScaledVector(o, L * t).addScaledVector(side, W * 0.5 * w).addScaledVector(lift, Math.abs(w) * W * 0.5 * fold);
    p.y -= t * t * L * 0.1;                                // le bout du rameau retombe un peu
    const d = v3((p.x - C.x) / R[0], (p.y - C.y) / R[1], (p.z - C.z) / R[2]);
    const r = d.length();
    const nn = v3(d.x / R[0], d.y / R[1] + 0.12, d.z / R[2]).normalize();
    // plus sombre au cœur et dessous, clair au bord et en haut
    const ao = (0.55 + 0.5 * Math.min(1, Math.max(0, (r - 0.35) / 0.75))) * (0.84 + 0.16 * (nn.y * 0.5 + 0.5)) * shade;
    ids.push(B.v(p, nn, u0 + sz * (0.5 + w * 0.5), v0 + sz * (0.01 + t * 0.97), [ao * 0.98, ao, ao * 0.96], 1, 1, anchor));
  }
  B.leaf.push(ids[0], ids[3], ids[1], ids[1], ids[3], ids[4], ids[1], ids[4], ids[2], ids[2], ids[4], ids[5]);
}

/** Couronne de rameaux autour d'un ellipsoïde (répartition régulière, un peu de hasard). */
function canopy(B, C, R, n, size, cells, anchor, rnd) {
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 1.75;                       // pas tout à fait jusqu'en bas (dessous : le cœur)
    const rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * golden + rnd() * 0.5;
    const d = v3(Math.cos(a) * rr, y, Math.sin(a) * rr).normalize();
    const depth = 0.42 + rnd() * 0.28;
    const from = v3(C.x + d.x * R[0] * depth, C.y + d.y * R[1] * depth, C.z + d.z * R[2] * depth);
    const dir = v3(d.x + (rnd() - 0.5) * 0.7, d.y * 0.8 + 0.25 + (rnd() - 0.5) * 0.5, d.z + (rnd() - 0.5) * 0.7);
    const L = size[0] + rnd() * (size[1] - size[0]);
    card(B, from, dir, L, cells[(rnd() * cells.length) | 0], C, R, anchor, rnd, 0.9 + rnd() * 0.2);
  }
}

/** Touffe : cœur dense + rameaux et touffes rondes tout autour. */
function clumpInto(B, C, R, kind, rnd, n, anchor, big = 1) {
  const cells = kind === 'blossom' ? ['cherry'] : kind === 'serr' ? ['serr', 'clumpSerr', 'clumpSerr'] : ['oval', 'clumpOval', 'clumpOval'];
  core(B, C, R, CORE[kind === 'blossom' ? 'pink' : 'green'], anchor, rnd, 0.6);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i + 0.5) / n * 1.6, rr = Math.sqrt(Math.max(0, 1 - y * y)), a = i * golden + rnd() * 0.6;
    const d = v3(Math.cos(a) * rr, y, Math.sin(a) * rr);
    const depth = 0.25 + rnd() * 0.3;
    const from = v3(C.x + d.x * R[0] * depth, C.y + d.y * R[1] * depth, C.z + d.z * R[2] * depth);
    const L = (R[0] + R[1]) * (0.45 + rnd() * 0.2) / big;
    card(B, from, v3(d.x, d.y + 0.3, d.z), L, cells[(rnd() * cells.length) | 0], C, R, anchor, rnd, 0.92 + rnd() * 0.16);
  }
}

/**
 * Géométrie d'un feuillu (instanciable). Deux groupes : 0 = bois (écorce), 1 = feuillage (atlas).
 * opts.bush : un buisson au pied (dans le feuillage : pas d'appel de dessin en plus).
 */
export function broadleafGeometry(species = 'round', seed = 1, opts = {}) {
  const S = SPECIES[species] || SPECIES.round;
  const rnd = rng(seed * 4513 + 7), B = builder();
  const yF = S.yF, C = v3(0, S.C, 0), R = S.R, bark = S.bark || [1, 1, 1], tr = S.trunkR;
  // tronc (évasé au pied) jusqu'à la fourche ; il se prolonge un peu dans la couronne
  const lean = v3((rnd() - 0.5) * 0.25, 0, (rnd() - 0.5) * 0.25);
  const trunkPts = [v3(0, -0.3, 0), v3(0, 0.45, 0), v3(lean.x * 0.5, yF * 0.6, lean.z * 0.5), v3(lean.x, yF, lean.z), v3(lean.x * 1.2, C.y + R[1] * 0.3, lean.z * 1.2)];
  {
    const sides = 8, base = B.n, rad = [tr * 1.75, tr * 1.25, tr * 1.05, tr * 0.85, tr * 0.3];
    trunkPts.forEach((p, j) => {
      for (let i = 0; i <= sides; i++) {
        const ang = i / sides * Math.PI * 2, c = Math.cos(ang), s = Math.sin(ang);
        const r = rad[j] * (1 + (j === 0 ? Math.sin(ang * 3) * 0.18 : 0));
        B.v(v3(p.x + c * r, p.y, p.z + s * r), v3(c, 0.15, s).normalize(), i / sides * 2, p.y / 1.6, bark, p.y > yF ? 1 : 0, 0, yF);
      }
    });
    for (let j = 0; j < trunkPts.length - 1; j++) for (let i = 0; i < sides; i++) {
      const a = base + j * (sides + 1) + i, b = a + sides + 1;
      B.wood.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  // charpentières : de la fourche vers l'intérieur de la couronne, puis quelques rameaux
  const limbs = [];
  for (let i = 0; i < S.limbs; i++) {
    const a = i / S.limbs * Math.PI * 2 + rnd() * 0.8, el = rnd();
    const end = v3(Math.cos(a) * R[0] * 0.6, C.y - R[1] * 0.15 + el * R[1] * 0.3, Math.sin(a) * R[2] * 0.6);
    const st = v3(lean.x, yF - 0.15 + rnd() * 0.5, lean.z);
    const mid = st.clone().lerp(end, 0.5); mid.y += 0.3;
    tube(B, [st, mid, end], tr * 0.62, tr * 0.22, 5, yF, bark);
    limbs.push(end);
    for (let k = 0; k < 2; k++) {
      const b = rnd() * Math.PI * 2;
      const tip = end.clone().add(v3(Math.cos(b) * R[0] * 0.3, R[1] * (0.15 + rnd() * 0.25), Math.sin(b) * R[2] * 0.3));
      tube(B, [mid.clone().lerp(end, 0.6), tip], tr * 0.2, tr * 0.06, 3, yF, bark);
    }
  }
  core(B, C, R, CORE[S.core], yF, rnd, 0.72);
  canopy(B, C, R, S.cards, S.size, S.cell, yF, rnd);
  // un rameau au bout de chaque charpentière (le bois rejoint le feuillage)
  for (const e of limbs) card(B, v3(e.x * 0.9, e.y, e.z * 0.9), v3(e.x, 0.6, e.z), S.size[0] * 0.9, S.cell[0], C, R, yF, rnd, 0.85);
  if (opts.bush) {
    const a = rnd() * Math.PI * 2;
    clumpInto(B, v3(Math.cos(a) * 1.6, 0.3, Math.sin(a) * 1.6), [0.85, 0.62, 0.85], 'oval', rnd, 14, 0);
  }
  const g = B.geometry();
  g.userData.species = species;
  return g;
}

/**
 * Touffe de feuillage seule (rayon ~1,1, centrée en 0) : remplace les anciennes « boules »
 * (buissons, couronnes du Grand Chêne, haies rondes). kind : 'leaf' | 'serr' | 'blossom'.
 * big : échelle prévue des instances (grosses touffes : rameaux plus petits et plus nombreux).
 */
export function clumpGeometry(kind = 'leaf', seed = 1, cards = 20, big = 1) {
  const B = builder(), rnd = rng(seed * 7717 + 3);
  clumpInto(B, v3(0, 0, 0), [0.95, 0.82, 0.95], kind === 'leaf' ? 'oval' : kind, rnd, Math.round(cards * Math.min(3.5, Math.pow(big, 0.8))), 0, Math.pow(big, 0.4));
  const g = B.geometry();
  g.userData.clump = kind;
  return g;
}

/** Hauteur du centre de la couronne d'une instance (échelles s en largeur, sy en hauteur). */
export const crownCenter = (S, s, sy) => S.yF * sy + (S.C - S.yF) * s * Math.pow(sy / s, 0.4);
/**
 * Matrice d'un feuillu avec la convention des anciens arbres : pied en (x, y, z), tronc de h m,
 * échelle s ; centre de la couronne vers y + top·h + 0,9 s (top = 1 : comme les anciennes boules ;
 * un peu plus bas pour les grands arbres, moins « sucette »). La couronne garde à peu près ses proportions.
 */
export function treeMatrix(m4, species, x, y, z, s, h, rotY, tilt = 0) {
  const S = SPECIES[species] || SPECIES.round;
  const want = (S.top || 1) * h + 0.9 * s;
  let a = 0.2 * s, b = 6 * s;
  for (let i = 0; i < 30; i++) { const m = (a + b) / 2; if (crownCenter(S, s, m) < want) a = m; else b = m; }
  const sy = (a + b) / 2;
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, rotY, 0, 'YXZ'));
  return m4.compose(v3(x, y - 0.05, z), q, v3(s, sy, s));
}

/** Teinte douce d'une instance d'après une couleur de palette (les feuilles sont déjà vertes). */
export function leafTint(hex, out = new THREE.Color(), vary = 0) {
  const c = new THREE.Color(hex), m = Math.max(c.r, c.g, c.b, 1e-3);
  const k = c.r >= c.g * 0.95 ? 0.5 : 0.3;                 // (feuillage roux ou doré de la palette : bien marqué)
  out.setRGB(1 - k + k * c.r / m, 1 - k + k * c.g / m, 1 - k + k * c.b / m);
  return out.multiplyScalar(1.02 + vary);
}
/** Couleur de palette rose : arbre en fleurs. */
export const isBlossom = (hex) => { const c = new THREE.Color(hex); return c.r > c.g * 1.08 && c.b > c.g * 0.85; };

// --- matériaux (partagés) ----------------------------------------------------------------------
const VERT_HEAD = 'attribute vec3 fol;\nuniform float uTime;\nvarying float vLeaf;\n';
// au-dessus de la fourche, la couronne garde ses proportions quand le tronc est étiré ; vent
const VERT_BEGIN = `#include <begin_vertex>
  vLeaf = fol.y;
  float folSx = 1.0, folSy = 1.0;
  vec4 folW = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
    folSx = length(instanceMatrix[0].xyz); folSy = length(instanceMatrix[1].xyz);
    folW = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  #endif
  // (couronne : hauteur = largeur × (étirement du tronc)^0,4 — les grands arbres ont une couronne plus haute)
  transformed.y -= (transformed.y - fol.z) * fol.x * (1.0 - pow(folSx / max(folSy, 1e-4), 0.6));
  {
    float ph = folW.x * 0.37 + folW.z * 0.23;
    float reach = (length(transformed.xz) * 0.03 + max(transformed.y, 0.0) * 0.01) * (0.25 + 0.75 * fol.x);
    transformed.x += sin(uTime * 1.2 + ph + transformed.y * 0.3) * reach;
    transformed.z += cos(uTime * 0.95 + ph * 1.3) * reach * 0.7;
    float fl = fol.y * 0.03 * sin(uTime * 5.3 + dot(transformed, vec3(2.1, 3.7, 1.3)) + ph);   // les feuilles frémissent
    transformed += vec3(fl, fl * 0.6, -fl);
  }`;
// normales : couronne = échelle uniforme ; tronc = vraie normale d'un objet étiré
const NORMAL_FIX = `#include <beginnormal_vertex>
  #ifdef USE_INSTANCING
  {
    float nr = length(instanceMatrix[0].xyz) / max(length(instanceMatrix[1].xyz), 1e-4);
    objectNormal.y *= nr * nr / mix(1.0, pow(nr, 0.6), fol.x);
  }
  #endif`;
function folVertex(sh, normals) {
  sh.uniforms.uTime = FOLIAGE.uTime;
  sh.vertexShader = VERT_HEAD + sh.vertexShader.replace('#include <begin_vertex>', VERT_BEGIN);
  if (normals) sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', NORMAL_FIX);
}

const blMats = {};
/** Matériaux des feuillus : { bark, leaves, depth (ombre portée découpée), list: [écorce, feuillage] }. */
export function broadleafMaterials(opts = {}) {
  const key = opts.lite ? 'l' : 'h';
  if (blMats[key] && blMats[key].leaves.map === tex('broadleaf', true)) return blMats[key];
  const atlas = tex('broadleaf', true);
  const bark = new THREE.MeshStandardMaterial({ map: tex('bark_willow_02_d', true, true), normalMap: opts.lite ? null : tex('bark_willow_02_n', false, true), roughness: 0.95, vertexColors: true });
  bark.color.setRGB(1.25, 1.18, 1.1);
  bark.onBeforeCompile = (sh) => { folVertex(sh, true); };
  bark.customProgramCacheKey = () => 'bl-bark-' + key;
  const leaves = new THREE.MeshStandardMaterial({ map: atlas, roughness: 0.82, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide });
  leaves.onBeforeCompile = (sh) => {
    folVertex(sh, true);
    sh.uniforms.uTint = FOLIAGE.uTint;
    sh.fragmentShader = 'uniform vec3 uTint;\n' + sh.fragmentShader
      // l'envers d'un rameau est éclairé comme l'endroit (normales « rondes » de la couronne)
      .replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''))
      .replace('#include <map_fragment>', '#include <map_fragment>\n  diffuseColor.rgb *= uTint;')
      // un peu de lumière traverse les feuilles (pas de feuillage noir à l'ombre)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.07;');
  };
  leaves.customProgramCacheKey = () => 'bl-leaves-' + key;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: atlas, alphaTest: 0.42 });
  // (le moteur recopie sur ce matériau la carte et l'alphaTest du groupe dessiné : le bois reste plein)
  depth.onBeforeCompile = (sh) => folVertex(sh, false);
  depth.customProgramCacheKey = () => 'bl-depth';
  return (blMats[key] = { bark, leaves, depth, list: [bark, leaves] });
}

/**
 * Raccourci pour les niveaux : { geo, mat, depth } d'une touffe, ou null en style dessin animé
 * (photos absentes) — on garde alors les anciennes boules.
 */
export function clump(kind = 'leaf', lite = false, seed = 1, big = 1) {
  if (!hasBroadleaf()) return null;
  const M = broadleafMaterials({ lite });
  return { geo: clumpGeometry(kind, seed, lite ? 16 : 22, big), mat: M.leaves, depth: M.depth };
}

/**
 * Feuillus instanciés : un InstancedMesh (2 appels de dessin : bois + feuillage) pour une liste
 * d'arbres { x, y, z, s, h }. opts : species, seed, bush, lite, tint(i, t, couleur), rot(i, t).
 */
export function broadleafMesh(list, opts = {}) {
  const M = broadleafMaterials({ lite: opts.lite });
  const sp = opts.species || 'round';
  const geo = opts.geo || broadleafGeometry(sp, opts.seed || 1, { bush: !!opts.bush });
  const inst = new THREE.InstancedMesh(geo, M.list, Math.max(1, list.length));
  inst.count = list.length;
  const m4 = new THREE.Matrix4(), c = new THREE.Color();
  const r = rng((opts.seed || 1) * 97 + 5);
  list.forEach((t, i) => {
    treeMatrix(m4, sp, t.x, t.y, t.z, t.s, t.h, opts.rot ? opts.rot(i, t) : r() * 6.28, (r() - 0.5) * 0.06);
    inst.setMatrixAt(i, m4);
    if (opts.tint) opts.tint(i, t, c); else c.setScalar(0.92 + r() * 0.16);
    inst.setColorAt(i, c);
  });
  inst.customDepthMaterial = M.depth;
  inst.castShadow = true; inst.receiveShadow = true;
  inst.userData.noOutline = true;
  inst.computeBoundingSphere();
  return inst;
}
