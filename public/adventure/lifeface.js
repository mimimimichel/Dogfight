/*
 * Matcha & Ainu — la couche de vie : des visages et des corps qui réagissent (façon Animal Crossing).
 *
 * Tout reste instancié (aucun appel de dessin en plus pour les bêtes) :
 *  - « rig » : certaines pièces d'un modèle portent un repère (attribut aRig : pivot + code) —
 *    yeux qui clignent (écrasés autour de leur centre), oreilles qui frémissent, queue qui remue —
 *    et les pièces de la tête un pivot de cou (aNeck) : la tête tourne, se penche, hoche.
 *    Chaque instance donne ses valeurs (aMood : ouverture des yeux, queue, oreilles, queue levée ;
 *    aHead : lacet, tangage, roulis de la tête) ; le nuanceur de sommets fait le reste.
 *  - visages des habitants : un petit décalque (yeux à reflets, sourcils, bouche, joues roses)
 *    tiré d'un atlas de 36 expressions (6 regards × 3 bouches × joues) ; un seul appel de dessin
 *    pour tous les visages d'une sorte (chiens, chats).
 */
import * as THREE from '../vendor/three.module.min.js';

export const RIG = { EYE: 2, EAR_R: 3, EAR_L: 4, TAIL: 5 };
/** Expressions (index du regard). */
export const EYE = { OPEN: 0, SHUT: 1, HAPPY: 2, WOW: 3, SAD: 4, SLEEPY: 5 };
export const MOUTH = { SMILE: 0, TALK: 1, WIDE: 2 };
export const tileOf = (eye, mouth, blush) => eye + 6 * (mouth + 3 * (blush ? 1 : 0));

const fill4 = (g, name, a, b, c, d) => {
  const n = g.attributes.position.count, arr = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { arr[i * 4] = a; arr[i * 4 + 1] = b; arr[i * 4 + 2] = c; arr[i * 4 + 3] = d; }
  g.setAttribute(name, new THREE.BufferAttribute(arr, 4));
  return g;
};
/** Une pièce animée : code (RIG.*) et pivot (dans le repère du modèle). */
export const tag = (g, code, px, py, pz) => fill4(g, 'aRig', px, py, pz, code);
/** Une pièce de la tête : elle tourne autour du cou (nx, ny, nz). */
export const neck = (g, nx, ny, nz) => fill4(g, 'aNeck', nx, ny, nz, 2);
/** Recopie les repères des pièces dans la géométrie fusionnée (zéro pour les pièces fixes). */
export function mergeRig(list, out) {
  for (const name of ['aRig', 'aNeck']) {
    if (!list.some(g => g.attributes[name])) continue;
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const a = new Float32Array(n * 4); let o = 0;
    for (const g of list) { const at = g.attributes[name]; if (at) a.set(at.array, o); o += g.attributes.position.count * 4; }
    out.setAttribute(name, new THREE.BufferAttribute(a, 4));
  }
  if (out.attributes.aRig && !out.attributes.aNeck) out.setAttribute('aNeck', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 4), 4));
  if (out.attributes.aNeck && !out.attributes.aRig) out.setAttribute('aRig', new THREE.BufferAttribute(new Float32Array(out.attributes.position.count * 4), 4));
  return out;
}
export const rigged = (geo) => !!(geo && geo.attributes && geo.attributes.aRig);

const RIG_GLSL = `
attribute vec4 aRig;
attribute vec4 aNeck;
#ifdef USE_INSTANCING
attribute vec4 aMood;
attribute vec4 aHead;
#endif
mat3 rgX(float a) { float c = cos(a), s = sin(a); return mat3(1.0, 0.0, 0.0, 0.0, c, s, 0.0, -s, c); }
mat3 rgY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0.0, -s, 0.0, 1.0, 0.0, s, 0.0, c); }
mat3 rgZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0.0, -s, c, 0.0, 0.0, 0.0, 1.0); }
vec3 rigP(vec3 p, float dir) {
#ifdef USE_INSTANCING
  float code = aRig.w;
  if (code > 1.5) {
    vec3 q = dir > 0.5 ? p : p - aRig.xyz;
    if (code < 2.5) { if (dir < 0.5) q.y *= max(aMood.x, 0.07); }
    else if (code < 4.5) q = rgZ(code < 3.5 ? aMood.z : -aMood.z) * q;
    else if (code < 5.5) q = rgY(aMood.y) * (rgX(aMood.w) * q);
    p = dir > 0.5 ? q : q + aRig.xyz;
  }
  if (aNeck.w > 1.5) {
    mat3 R = rgY(aHead.x) * rgX(aHead.y) * rgZ(aHead.z);
    p = dir > 0.5 ? R * p : aNeck.xyz + R * (p - aNeck.xyz);
  }
#endif
  return p;
}
`;
/** Ajoute le « rig » à une matière (une fois ; sans effet sur les géométries qui n'en ont pas). */
export function rigMaterial(m) {
  if (Array.isArray(m)) { m.forEach(rigMaterial); return m; }
  if (!m || m.userData.rig || !m.isMaterial) return m;
  m.userData.rig = true;
  const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey.call(m);
  m.onBeforeCompile = function (sh, r) {
    if (prev) prev.call(this, sh, r);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + RIG_GLSL)
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nobjectNormal = rigP(objectNormal, 1.0);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed = rigP(transformed, 0.0);');
  };
  m.customProgramCacheKey = () => prevKey + '|rig';
  m.needsUpdate = true;
  return m;
}

// ---------------------------------------------------------------------------
// Clignements, frémissements (petits automates par bête / par habitant)
// ---------------------------------------------------------------------------
/** Ouverture des yeux (1 → 0 → 1 pendant un clignement), à intervalles au hasard (parfois deux de suite). */
export function blink(s, dt) {
  if (s.bt === undefined) s.bt = 0.5 + Math.random() * 4;
  if ((s.bt -= dt) <= 0) { s.bt = Math.random() < 0.18 ? 0.3 : 1.8 + Math.random() * 4.5; s.bk = 0.15; }
  if (s.bk > 0) { s.bk -= dt; const k = Math.max(0, s.bk) / 0.15; return Math.abs(k * 2 - 1); }
  return 1;
}
/** Une oreille qui frémit de temps en temps (angle). */
export function twitch(s, dt, often) {
  if (s.et === undefined) s.et = Math.random() * 4;
  if ((s.et -= dt * (often || 1)) <= 0) { s.et = 1.5 + Math.random() * 5; s.ek = 0.32; s.es = Math.random() < 0.5 ? 1 : -1; }
  if (s.ek > 0) { s.ek -= dt; const k = 1 - Math.max(0, s.ek) / 0.32; return Math.sin(k * Math.PI * 3) * (1 - k) * 0.45 * s.es; }
  return 0;
}

// ---------------------------------------------------------------------------
// L'atlas des visages : 6 × 6 cases (regard en colonne ; bouche + joues en ligne)
// ---------------------------------------------------------------------------
const T = 160, EYE_H = 99;   // une case ; le haut (0..EYE_H) va sur le crâne, le bas sur le museau
let ATLAS = null;
function drawTile(x, ox, oy, eye, mouth, blush) {
  const ink = '#2a1810', brow = '#3a2418';
  x.save(); x.translate(ox, oy);
  x.lineCap = 'round'; x.lineJoin = 'round';
  const EX = [T * 0.3, T * 0.7], EY = 47;
  // joues roses (douces)
  if (blush) for (const s of [0, 1]) {
    const cx = s ? T * 0.86 : T * 0.14, cy = 76;
    const g = x.createRadialGradient(cx, cy, 1, cx, cy, 16);
    g.addColorStop(0, 'rgba(255,120,150,0.9)'); g.addColorStop(0.6, 'rgba(255,130,160,0.55)'); g.addColorStop(1, 'rgba(255,140,170,0)');
    x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, 17, 10, 0, 0, Math.PI * 2); x.fill();
    x.strokeStyle = 'rgba(255,235,240,0.85)'; x.lineWidth = 1.6;
    for (let k = -1; k <= 1; k++) { x.beginPath(); x.moveTo(cx + k * 6 - 2, cy + 3); x.lineTo(cx + k * 6 + 2, cy - 3); x.stroke(); }
  }
  for (const s of [0, 1]) {
    const cx = EX[s], cy = EY, m = s ? -1 : 1;   // (m : vers le nez)
    x.strokeStyle = ink; x.fillStyle = ink;
    if (eye === 0 || eye === 3 || eye === 4) {
      const big = eye === 3, rx = big ? 15 : 13.5, ry = big ? 18 : 16.5;
      // liseré clair (les yeux se voient aussi sur un pelage sombre)
      x.fillStyle = 'rgba(255,248,236,0.9)'; x.beginPath(); x.ellipse(cx, cy, rx + 2.4, ry + 2.4, 0, 0, Math.PI * 2); x.fill();
      if (big) { x.fillStyle = '#fffaf2'; x.beginPath(); x.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); x.fill(); }
      const pr = big ? 0.6 : 1.12;
      const g = x.createLinearGradient(0, cy - ry, 0, cy + ry);
      g.addColorStop(0, '#120a06'); g.addColorStop(0.7, '#2a160c'); g.addColorStop(1, '#5a3420');
      x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy + (big ? 1 : 0), rx * pr, ry * pr, 0, 0, Math.PI * 2); x.fill();
      // reflets : un gros en haut, un petit en bas
      x.fillStyle = '#ffffff';
      x.beginPath(); x.ellipse(cx - 3.5 * pr * m + (s ? 1 : -1) * 0, cy - 5.5 * pr, 4.4 * pr, 5 * pr, -0.4, 0, Math.PI * 2); x.fill();
      x.beginPath(); x.arc(cx + 4 * pr, cy + 6 * pr, 2.1 * pr, 0, Math.PI * 2); x.fill();
      if (eye === 4) { x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(cx - 3 * m, cy + 3, 2.4, 0, Math.PI * 2); x.fill(); }
    } else if (eye === 1) {
      // fermés : un trait arrondi, petits cils
      x.lineWidth = 4.6; x.beginPath(); x.arc(cx, cy - 6, 11, Math.PI * 0.18, Math.PI * 0.82); x.stroke();
      x.lineWidth = 2.6; x.beginPath(); x.moveTo(cx + 10 * m * -1, cy + 0.5); x.lineTo(cx + 14 * m * -1, cy - 2.5); x.stroke();
    } else if (eye === 2) {
      // heureux : ^ ^
      x.lineWidth = 5; x.beginPath(); x.arc(cx, cy + 6, 11, Math.PI * 1.15, Math.PI * 1.85); x.stroke();
    } else if (eye === 5) {
      // ensommeillés : paupière lourde, demi-œil
      x.fillStyle = 'rgba(255,248,236,0.9)'; x.beginPath(); x.ellipse(cx, cy + 3, 13.5, 10, 0, 0, Math.PI); x.fill();
      x.fillStyle = '#1a0e08'; x.beginPath(); x.ellipse(cx, cy + 2, 11.5, 9.5, 0, 0, Math.PI); x.fill();
      x.fillStyle = '#ffffff'; x.beginPath(); x.arc(cx - 3, cy + 5, 2.2, 0, Math.PI * 2); x.fill();
      x.strokeStyle = ink; x.lineWidth = 4.2; x.beginPath(); x.moveTo(cx - 13, cy + 2); x.quadraticCurveTo(cx, cy - 1, cx + 13, cy + 2); x.stroke();
    }
    // sourcils
    x.strokeStyle = brow; x.lineWidth = 4.2;
    const by = eye === 3 ? 16 : eye === 5 ? 29 : eye === 2 ? 25 : 24;
    x.beginPath();
    if (eye === 4) { x.moveTo(cx - 9 * m, by + 6); x.quadraticCurveTo(cx, by + 1, cx + 9 * m, by - 3); }   // tristes : l'intérieur relevé
    else if (eye === 5) { x.moveTo(cx - 9, by + 1); x.lineTo(cx + 9, by + 1); }
    else { x.moveTo(cx - 9, by + 3); x.quadraticCurveTo(cx, by - 3, cx + 9, by + 3); }
    x.stroke();
  }
  // la bouche (sur le museau : y ≥ EYE_H)
  const my = EYE_H + 4, cx = T / 2;
  x.strokeStyle = ink; x.lineWidth = 3.6;
  x.beginPath(); x.moveTo(cx, my - 2); x.lineTo(cx, my + 8); x.stroke();
  if (mouth === 0) {
    x.beginPath(); x.moveTo(cx - 15, my + 9); x.quadraticCurveTo(cx - 8, my + 17, cx, my + 8); x.quadraticCurveTo(cx + 8, my + 17, cx + 15, my + 9); x.stroke();
  } else {
    const w = mouth === 2 ? 15 : 11, h = mouth === 2 ? 18 : 11;
    x.fillStyle = '#5a1418'; x.beginPath(); x.moveTo(cx - w, my + 8); x.quadraticCurveTo(cx, my + 5, cx + w, my + 8); x.quadraticCurveTo(cx + w * 0.9, my + 8 + h, cx, my + 8 + h); x.quadraticCurveTo(cx - w * 0.9, my + 8 + h, cx - w, my + 8); x.fill();
    x.lineWidth = 3; x.stroke();
    x.fillStyle = '#f07a8a'; x.beginPath(); x.ellipse(cx, my + 8 + h * 0.72, w * 0.55, h * 0.3, 0, 0, Math.PI * 2); x.fill();
  }
  x.restore();
}
export function faceAtlas() {
  if (ATLAS) return ATLAS;
  const c = document.createElement('canvas'); c.width = c.height = T * 6;
  const x = c.getContext('2d');
  for (let b = 0; b < 2; b++) for (let mo = 0; mo < 3; mo++) for (let e = 0; e < 6; e++) { const t = tileOf(e, mo, b); drawTile(x, (t % 6) * T, Math.floor(t / 6) * T, e, mo, b); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return (ATLAS = tex);
}
let FACE_MAT = null;
/** La matière des visages : décalque éclairé, case choisie par instance (attribut aTile). */
export function faceMaterial() {
  if (FACE_MAT) return FACE_MAT;
  const m = new THREE.MeshStandardMaterial({ map: faceAtlas(), transparent: true, depthWrite: false, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n#ifdef USE_INSTANCING\nattribute float aTile;\n#endif')
      .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_INSTANCING\nvMapUv = (vMapUv + vec2(mod(aTile, 6.0), 5.0 - floor(aTile / 6.0 + 0.01))) / 6.0;\n#endif');
  };
  m.customProgramCacheKey = () => 'life-face';
  return (FACE_MAT = m);
}
/** Un morceau de sphère (centre c, rayon r, échelle s) dont les UV vont de v0 à v1 dans la case. */
function patch(r, c, s, phi0, phi1, th0, th1, v0, v1, w, h) {
  const g = new THREE.SphereGeometry(r, w, h, Math.PI / 2 + phi0, phi1 - phi0, th0, th1 - th0);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, v0 + uv.getY(i) * (v1 - v0));
  g.scale(s[0], s[1], s[2]); g.translate(c[0], c[1], c[2]);
  return g.toNonIndexed();
}
const DEG = Math.PI / 180;
const VSPLIT = 1 - EYE_H / T;   // (v du bas de la zone des yeux)
/** Le visage d'un habitant (chien ou chat debout), posé sur sa tête. */
export function faceGeo(kind) {
  const cat = kind === 'cat';
  const head = cat ? { c: [0, 1.44, 0], s: [1.08, 0.95, 1] } : { c: [0, 1.46, 0], s: [1, 1, 1] };
  const muz = cat ? { c: [0, 1.35, 0.24], r: 0.13, s: [1.35, 0.72, 1] } : { c: [0, 1.38, 0.26], r: 0.16, s: [1, 0.8, 1.2] };
  const parts = [patch(0.3 * 1.018, head.c, head.s, -55 * DEG, 55 * DEG, 50 * DEG, 105 * DEG, VSPLIT, 1, 14, 8),
    patch(muz.r * 1.035, muz.c, muz.s, -50 * DEG, 50 * DEG, 74 * DEG, 150 * DEG, 0, VSPLIT - 0.004, 10, 8)];
  const out = new THREE.BufferGeometry();
  for (const [name, k] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    let n = 0; for (const g of parts) n += g.attributes.position.count;
    const a = new Float32Array(n * k); let o = 0;
    for (const g of parts) { a.set(g.attributes[name].array, o); o += g.attributes[name].array.length; }
    out.setAttribute(name, new THREE.BufferAttribute(a, k));
  }
  out.computeBoundingSphere();
  out.userData.face = true;
  return out;
}
/** Pivot du cou des habitants. */
export const NECK = { dog: [0, 1.2, 0.02], cat: [0, 1.18, 0.02] };

/**
 * Un œil (maillage centré sur l'œil) qui cligne tout seul, à intervalles au hasard : rien à animer
 * ailleurs (personnages de quête : Papi Berger, Gaston, Nimbus…). Les deux yeux partagent l'état s.
 */
export function selfBlink(mesh, s) {
  s = s || {};
  mesh.onBeforeRender = () => {
    const now = performance.now() / 1000;
    if (s.f !== now) { const dt = s.last === undefined ? 0.016 : Math.min(0.1, now - s.last); s.last = now; s.f = now; s.o = blink(s, dt); }
    mesh.scale.y = Math.max(0.08, s.o);
  };
  return s;
}
