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


function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

/**
 * Géométrie d'un sapin sculpté (hauteur ~6,2 m à l'échelle 1, pied en y = 0) : des étages de
 * « jupes » de branches pleines, dont le bord est découpé en pointes qui retombent, avec un
 * dessous sombre. Pas de cartes transparentes : une silhouette nette et pleine, et la neige se
 * pose sur le dessus de chaque étage (dans le shader, d'après l'orientation).
 * Deux groupes : 0 = tronc (écorce), 1 = aiguilles.
 */
export function firGeometry(seed = 1, opts = {}) {
  const r = rng(seed * 7919 + 13);
  const H = opts.height || 6.2, R0 = opts.radius || 2.1, levels = opts.levels || 10;
  const T = Math.max(4, Math.min(7, Math.round(levels / 2)));       // étages
  const lobes = opts.lobes || (levels <= 8 ? 9 : 12);               // pointes par étage
  const N = lobes * 2;                                              // pointe, creux, pointe…
  const pos = [], nor = [], uv = [], col = [], idxT = [], idxB = [];
  let n = 0;
  const v = (x, y, z, nx, ny, nz, u, w, c) => { const l = Math.hypot(nx, ny, nz) || 1; pos.push(x, y, z); nor.push(nx / l, ny / l, nz / l); uv.push(u, w); col.push(c, c, c); return n++; };
  // tronc : visible sous le premier étage
  {
    const seg = 7, h = H * 0.5;
    for (let j = 0; j <= 1; j++) {
      const y = h * j, rad = j ? 0.13 : 0.24;
      for (let i = 0; i <= seg; i++) { const a = i / seg * Math.PI * 2; v(Math.cos(a) * rad, y - 0.2, Math.sin(a) * rad, Math.cos(a), 0, Math.sin(a), i / seg * 2, y / 1.4, 0.75); }
    }
    for (let i = 0; i < seg; i++) { const a = i, b = a + seg + 1; idxT.push(a, b, a + 1, a + 1, b, b + 1); }
  }
  const t0 = n;
  const rot0 = r() * 6.28;
  for (let k = 0; k < T; k++) {
    const f = k / (T - 1);                                   // 0 en bas, 1 en haut
    const yb = H * (0.13 + 0.8 * Math.pow(k / T, 0.92));      // bas de l'étage (pointes)
    const yt = k === T - 1 ? H : H * (0.13 + 0.8 * Math.pow((k + 1.55) / T, 0.92));
    const Rb = R0 * (1 - 0.8 * k / T) * (0.94 + r() * 0.12);
    const hh = yt - yb, rot = rot0 + k * 0.9 + r() * 0.5;
    const ring = (fn) => { const ids = []; for (let i = 0; i <= N; i++) { const a = rot + i / N * Math.PI * 2, tip = i % 2 === 0; ids.push(fn(Math.cos(a), Math.sin(a), tip, i)); } return ids; };
    const jit = () => 0.92 + r() * 0.16;
    const U = (i) => i / N * lobes * 0.5;
    const top = k === T - 1;
    // A : haut de l'étage (près de l'axe ; pointe pour le dernier)
    const A = ring((c, s, tip, i) => v(c * (top ? 0.0 : Rb * 0.12), yt, s * (top ? 0 : Rb * 0.12), c * 0.25, 1, s * 0.25, U(i), 0, 0.92));
    // B : épaule (un peu bombée), les pointes déjà marquées
    const B = ring((c, s, tip, i) => { const rr = Rb * (tip ? 0.6 : 0.5); return v(c * rr, yt - hh * 0.5, s * rr, c * 0.6, 0.85, s * 0.6, U(i), 0.55, 0.9); });
    // C : bord, pointes qui retombent, creux remontés
    const rim = [];
    const C = ring((c, s, tip, i) => { const j = jit(); const rr = Rb * (tip ? 1.0 * j : 0.74); const y = yb + (tip ? -Rb * 0.13 * j : Rb * 0.06); rim.push([c, s, rr, y, tip]); return v(c * rr, y, s * rr, c * 0.95, tip ? 0.42 : 0.6, s * 0.95, U(i), 1.1, tip ? 1.0 : 0.82); });
    // dessous (sombre) : le bord dupliqué, puis repli vers le tronc
    const Cu = rim.map(([c, s, rr, y, tip], i) => v(c * rr, y, s * rr, c * 0.6, -0.8, s * 0.6, U(i), 1.1, 0.42));
    const D = ring((c, s, tip, i) => v(c * Rb * 0.32, yb + hh * 0.22, s * Rb * 0.32, c * 0.3, -1, s * 0.3, U(i), 1.6, 0.28));
    const quad = (P, Q) => { for (let i = 0; i < N; i++) idxB.push(P[i], Q[i], P[i + 1], P[i + 1], Q[i], Q[i + 1]); };
    quad(A, B); quad(B, C); quad(Cu, D);
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

/** Texture d'aiguilles (couleur + relief), dessinée une fois : des milliers de petits traits. */
let needleTex = null;
function needles() {
  if (needleTex) return needleTex;
  needleTex = RT.realTex(256, 256, 77, (x, y, w, h, R) => {
    x.fillStyle = '#21472b'; x.fillRect(0, 0, w, h);
    y.fillStyle = '#5a5a5a'; y.fillRect(0, 0, w, h);
    const pal = ['#2e6b3d', '#3b7e48', '#1d4227', '#4a8c51', '#2a5c35', '#356f40', '#58985a'];
    for (let i = 0; i < 3400; i++) {
      const px = R() * w, py = R() * h, L = 5 + R() * 10, a = Math.PI / 2 + (R() - 0.5) * 0.9;
      const dx = Math.cos(a) * L, dy = Math.sin(a) * L, lw = 1 + R() * 1.4, c = pal[(R() * pal.length) | 0], hv = 120 + R() * 120 | 0;
      for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
        if (px + ox < -16 || px + ox > w + 16 || py + oy < -16 || py + oy > h + 16) continue;
        x.strokeStyle = c; x.lineWidth = lw; x.beginPath(); x.moveTo(px + ox, py + oy); x.lineTo(px + ox + dx, py + oy + dy); x.stroke();
        y.strokeStyle = `rgb(${hv},${hv},${hv})`; y.lineWidth = lw; y.beginPath(); y.moveTo(px + ox, py + oy); y.lineTo(px + ox + dx, py + oy + dy); y.stroke();
      }
    }
  }, { strength: 4 });
  return needleTex;
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
  const nt = needles();
  const needlesMat = new THREE.MeshStandardMaterial({ map: nt.map, normalMap: opts.lite ? null : nt.normalMap, roughness: 0.9, vertexColors: true });
  needlesMat.normalScale = new THREE.Vector2(0.8, 0.8);
  const needles_ = needlesMat;
  needles_.onBeforeCompile = (sh) => {
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
          float reach = length(transformed.xz) * 0.03 + transformed.y * 0.006;
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
          // bruit doux (deux échelles) pour une limite de neige irrégulière, en paquets
          vec2 q = vWPos.xz * 1.7 + vWPos.y * 0.9;
          float nz = sin(q.x * 2.1) * sin(q.y * 1.9) * 0.5 + sin(q.x * 5.3 + q.y * 4.7) * 0.25;
          float s = smoothstep(0.5, 0.68, vSnowUp + nz * 0.12) * uSnow;
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.94, 0.97, 1.0), s);
        }`);
  };
  needles_.customProgramCacheKey = () => 'fir2-needles-' + (snow > 0 ? 's' : 'n') + (opts.lite ? 'l' : 'h');
  return [bark, needles_];
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

/** Géométrie mise à l'échelle (l'ancre de la couronne suit). */
function scaled(g, k, dy = 0) {
  g.scale(k, k, k); g.translate(0, dy, 0);
  const f = g.attributes.fol;
  for (let i = 0; i < f.count; i++) f.setZ(i, f.getZ(i) * k + dy);
  g.computeBoundingSphere(); g.computeBoundingBox();
  return g;
}
/** Objets de la couche de vie (lifekit.js) : buisson et arbuste en vraies feuilles, ou null (dessin animé). */
export function propBush(lite, seed = 9) {
  if (!hasBroadleaf()) return null;
  const M = broadleafMaterials({ lite });
  const g = clumpGeometry('serr', seed, lite ? 16 : 22, 1.2);
  g.scale(1.25, 0.8, 1.25);
  return { geo: scaled(g, 1, 0.62), mat: M.leaves, depth: M.depth };
}
export function propSapling(lite, seed = 5) {
  if (!hasBroadleaf()) return null;
  const M = broadleafMaterials({ lite });
  return { geo: scaled(broadleafGeometry('fruit', seed), 0.5), mat: M.list, depth: M.depth };
}
