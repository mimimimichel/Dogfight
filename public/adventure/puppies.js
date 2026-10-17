/*
 * Matcha & Ainu — les chiots perdus (idée « Astro Bot »).
 *
 * 3 chiots se cachent dans chaque monde (pupdata.js). Quand on s'approche, on
 * entend un petit gémissement et une bulle « Ouaf ? » apparaît au-dessus de la
 * cachette. On le touche : il saute de joie, cœurs, fanfare, une réplique… puis
 * il file au Parc des Toutous. Là, près de la niche de Mamie, les chiots
 * retrouvés vivent leur vie : ils se courent après, font la sieste, poussent
 * les balles, viennent dire bonjour et ont chacun leur petite phrase.
 *
 * Les chiots sont de vrais petits modèles « chibi » (grosse tête, grands yeux
 * brillants, pelage à mèches et grain de poil) faits d'un seul maillage animé
 * par un petit squelette (corps, tête, yeux, oreilles, queue, 4 pattes) : un
 * seul appel de dessin par chiot sur téléphone, deux sur ordinateur (yeux et
 * truffe brillants à part).
 *
 * Sauvegarde : la liste des chiots retrouvés du monde (save.pups, partagée en
 * monde partagé comme le reste de la sauvegarde) + la collection du joueur
 * (pupdata.js, PUPS_KEY, rangée dans son tiroir de profil).
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as T from './toon.js';
import * as M from './models.js';
import { PUPS, pupsOf, rescuedIds, addRescued } from './pupdata.js';

const TAU = Math.PI * 2;
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * t; };
const ease = (cur, tgt, k) => cur + (tgt - cur) * k;
function hash3(x, y, z) { const h = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return h - Math.floor(h); }
function vnoise(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(l(l(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx), l(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx), fy),
    l(l(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx), l(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}

// ---------------------------------------------------------------------------
// Matières : pelage (grain de poils, mat) et yeux / truffe (brillants)
// ---------------------------------------------------------------------------
let furMat = null, glossMat = null;
function furMaterial() {
  if (furMat) return furMat;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPupP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvPupP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vPupP;
float pupH(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float pupN(vec3 x) { vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(pupH(i), pupH(i + vec3(1,0,0)), f.x), mix(pupH(i + vec3(0,1,0)), pupH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(pupH(i + vec3(0,0,1)), pupH(i + vec3(1,0,1)), f.x), mix(pupH(i + vec3(0,1,1)), pupH(i + vec3(1,1,1)), f.x), f.y), f.z); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
      {
        // mèches fines (étirées) + grain : le pelage ne brille pas comme du plastique
        vec3 q = vPupP * vec3(150.0, 46.0, 120.0);
        float g = pupN(q) * 0.55 + pupN(q * 2.7 + 5.3) * 0.3 + pupN(vPupP * 22.0) * 0.15;
        diffuseColor.rgb *= mix(0.78, 1.1, g);
      }`);
  };
  m.customProgramCacheKey = () => 'pup-fur';
  return (furMat = m);
}
function glossMaterial() {
  if (glossMat) return glossMat;
  glossMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.14, metalness: 0.05 });
  glossMat.userData.gloss = true;
  return glossMat;
}

// ---------------------------------------------------------------------------
// Petit atelier de formes : chaque morceau est posé (dans l'espace du chiot),
// peint sommet par sommet (motif du pelage) et attaché à un os (rigide).
// ---------------------------------------------------------------------------
const BONES = ['root', 'body', 'head', 'tail', 'legFL', 'legFR', 'legBL', 'legBR', 'earL', 'earR', 'eyes'];
const BI = Object.fromEntries(BONES.map((n, i) => [n, i]));
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();
const _c = new THREE.Color(), _c2 = new THREE.Color();

class PupKit {
  constructor(detail) { this.parts = []; this.det = detail; }
  sph(r, w, h) { return new THREE.SphereGeometry(r, Math.max(6, Math.round((w || 22) * this.det)), Math.max(4, Math.round((h || 16) * this.det))); }
  /** o : position / rotation / échelle ; paint : couleur (nombre) ou fn(x, y, z, couleur) ; bone ; kind : fur | skin | gloss. */
  add(geo, o, paint, bone, kind, fluff) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(o.rx || 0, o.ry || 0, o.rz || 0);
    _q.setFromEuler(_e);
    _s.set(o.sx || 1, o.sy || o.sx || 1, o.sz || o.sx || 1);
    _m4.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q, _s);
    g.applyMatrix4(_m4);
    if (!g.attributes.normal) g.computeVertexNormals();
    // touffes : la surface se soulève en mèches (la silhouette n'est pas lisse comme du plastique)
    if (kind === 'fur' && fluff > 0) {
      const p = g.attributes.position, n = g.attributes.normal, den = 34;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const f = vnoise(x * den, y * den, z * den) * 0.7 + vnoise(x * den * 2.3 + 5, y * den * 2.3, z * den * 2.3) * 0.3;
        const t = Math.pow(clamp((f - 0.36) / 0.42, 0, 1), 1.5);
        _n.set(n.getX(i), n.getY(i) - 0.25 * t, n.getZ(i) - 0.35 * t).normalize();
        p.setXYZ(i, x + _n.x * fluff * t, y + _n.y * fluff * t, z + _n.z * fluff * t);
      }
    }
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      if (typeof paint === 'function') paint(p.getX(i), p.getY(i), p.getZ(i), _c); else _c.set(paint);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.parts.push({ g, bone: BI[bone], gloss: kind === 'gloss' });
    return this;
  }
  /** Fusionne en une géométrie à squelette rigide (un os par sommet). */
  merge(filter) {
    const list = this.parts.filter(filter);
    let n = 0;
    for (const q of list) n += q.g.attributes.position.count;
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    let o = 0;
    for (const q of list) {
      const c = q.g.attributes.position.count;
      pos.set(q.g.attributes.position.array, o * 3);
      nor.set(q.g.attributes.normal.array, o * 3);
      col.set(q.g.attributes.color.array, o * 3);
      for (let i = 0; i < c; i++) { si[(o + i) * 4] = q.bone; sw[(o + i) * 4] = 1; }
      o += c;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    g.computeBoundingSphere(); g.boundingSphere.radius *= 1.35;
    g.computeBoundingBox();
    return g;
  }
}

/** Oreille « feuille » qui pend : le haut (attache) à l'origine, elle descend. */
function leafGeo(k, w, h, d) {
  const g = k.sph(1, 16, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (1 - y) / 2;   // 0 en haut, 1 en bas
    const k2 = 0.55 + 0.45 * Math.sin(Math.min(1, t * 1.15) * Math.PI * 0.6);
    p.setXYZ(i, x * w * k2, (y - 1) * h, z * d * (0.6 + 0.4 * t));
  }
  g.computeVertexNormals();
  return g;
}
/** Oreille dressée : la base à l'origine, pointue vers le haut (point : 0 ronde … 1 pointue). */
function pointGeo(k, w, h, d, point) {
  const g = k.sph(1, 16, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), t = (y + 1) / 2;
    const kk = 1 - t * point * 0.85;
    p.setXYZ(i, x * w * kk, t * h, z * d * kk - t * t * h * 0.12);
  }
  g.computeVertexNormals();
  return g;
}
/** Queue : un tube effilé le long d'une courbe (base à l'origine). */
function tailGeo(k, pts, r0, r1) {
  const curve = new THREE.CatmullRomCurve3(pts.map(p => new THREE.Vector3(p[0], p[1], p[2])));
  const seg = 12, rad = Math.max(6, Math.round(10 * k.det));
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const p = g.attributes.position, P = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, P);
    const r = r0 + (r1 - r0) * Math.pow(i / seg, 1.3);
    for (let j = 0; j <= rad; j++) { const q = i * (rad + 1) + j; v.fromBufferAttribute(p, q).sub(P).multiplyScalar(r).add(P); p.setXYZ(q, v.x, v.y, v.z); }
  }
  g.computeVertexNormals();
  const end = curve.getPointAt(1);
  return { g, end };
}

/**
 * Le chiot, d'après sa fiche (look). Rend { group, rig, height }.
 * opts.lite : un seul maillage (téléphones).
 */
export function buildPup(look, opts) {
  opts = opts || {};
  const k = new PupKit(opts.lite ? 0.7 : 1);
  const lk = look;
  const chunky = lk.chunky || 1, legK = lk.leg || 1, ml = lk.muzzle || 1, fl = lk.fluff || 0;
  const F = lk.fur, B2 = lk.b2 !== undefined ? lk.b2 : lk.fur, W = lk.belly !== undefined ? lk.belly : lk.fur;
  const furLen = 0.008 + fl * 0.026;
  // ---- proportions (pattes au sol en y = 0, museau vers +z) ----
  const legLen = 0.17 * legK, br = 0.185 * Math.sqrt(chunky), bw = Math.sqrt(chunky), bl = 0.13 * (lk.body || 1);
  const by = legLen + br * 0.72;
  const hr = 0.25 * (lk.head || 1);
  const NK = { x: 0, y: by + br * 0.5, z: bl / 2 + br * 0.42 };
  const H = { x: 0, y: NK.y + hr * 0.82, z: NK.z + hr * 0.32 };
  // museau : sa pointe dépasse toujours de la tête (même les nez écrasés des bouledogues)
  const flat = ml < 0.8;
  const mzr = { x: hr * (flat ? 0.56 : 0.46) * (lk.droopy ? 1.15 : 1), y: hr * (flat ? 0.38 : 0.34) * (lk.droopy ? 1.1 : 1), z: hr * (0.26 + 0.22 * ml) };
  const MZ = { x: 0, y: H.y - hr * (flat ? 0.3 : 0.36), z: H.z + Math.max(hr * 1.0, hr * (1.1 + 0.5 * (ml - 1))) - mzr.z };
  const TB = { x: 0, y: by + br * 0.4, z: -(bl / 2 + br * 0.82) };
  const LX = br * bw * 0.56, LZF = bl / 2 + br * 0.28, LZB = -(bl / 2 + br * 0.3), LT = by - br * 0.1;
  const lr = 0.058 * Math.sqrt(chunky) * (legK < 0.7 ? 1.12 : 1);
  const PINK = 0xf2a2aa;

  // ---- motif du pelage : couleur d'un point (espace du chiot) selon le morceau ----
  const hx = (x) => x / hr, hy = (y) => (y - H.y) / hr, hz = (z) => (z - H.z) / hr;
  const faceFront = (z) => sst(0.35, 0.75, hz(z));
  const blaze = (x, y, z, wdt) => (Math.abs(hx(x)) < wdt + Math.max(0, -hy(y)) * 0.6 && hz(z) > 0.35 && hy(y) < 0.95 ? 1 : 0);
  const under = (y) => sst(by - br * 0.05, by - br * 0.75, y);
  const spot = (x, y, z, f, th) => vnoise(x * f + 11, y * f + 3, z * f + 7) > th;
  const coat = (part) => (x, y, z, c) => {
    c.set(F);
    const P = lk.pattern || 'solid';
    const head = part === 'head' || part === 'muzzle' || part === 'cheek';
    if (P === 'solid' || P === 'urajiro' || P === 'points' || P === 'saltpepper') {
      if (part === 'body' || part === 'neck' || part === 'chest') c.lerp(_c2.set(W), under(y) * (P === 'urajiro' ? 1 : 0.7));
      if (part === 'muzzle') c.lerp(_c2.set(P === 'points' ? B2 : W), P === 'solid' ? 0.35 : 1);
      if (part === 'leg') c.lerp(_c2.set(P === 'points' ? B2 : W), P === 'urajiro' ? sst(0.12, 0.04, y) : P === 'points' ? sst(0.14, 0.06, y) : 0.15);
      if (P === 'urajiro') {
        if (part === 'cheek' || (part === 'head' && hy(y) < -0.2 && faceFront(z) > 0.3)) c.set(W);
        if (part === 'chest') c.lerp(_c2.set(W), sst(by + br * 0.4, by - br * 0.1, y));
        if (part === 'tail') c.lerp(_c2.set(W), 0.35);
      }
      if (P === 'points' && part === 'chest') c.lerp(_c2.set(B2), sst(by + br * 0.3, by - br * 0.2, y) * 0.9);
      if (P === 'saltpepper') { const n = vnoise(x * 40, y * 40, z * 40); c.multiplyScalar(0.8 + n * 0.45); if (part === 'leg') c.lerp(_c2.set(W), 0.5); }
    } else if (P === 'tricolor') {
      c.set(F);
      if (part === 'body' && y > by + br * 0.25) c.set(B2);
      if (part === 'body' || part === 'chest' || part === 'neck') c.lerp(_c2.set(W), under(y));
      if (part === 'chest') c.lerp(_c2.set(W), sst(by + br * 0.6, by, y) * 0.9);
      if (part === 'leg') c.lerp(_c2.set(W), sst(0.2, 0.1, y) * 0.85 + 0.15);
      if (part === 'muzzle' || blaze(x, y, z, 0.12)) c.set(W);
      if (part === 'tail') c.lerp(_c2.set(B2), 0.6);
    } else if (P === 'spots') {
      c.set(F);
      if ((part === 'body' || part === 'head' || part === 'leg' || part === 'tail' || part === 'neck') && spot(x, y, z, 15, 0.74)) c.set(B2);
    } else if (P === 'patch') {
      c.set(F);
      if (head && hx(x) > 0.05 && hy(y) > -0.1 && part !== 'muzzle') c.set(B2);
      if (part === 'head' && hx(x) < -0.2 && hy(y) > 0.25 && hz(z) < 0.6) c.set(B2);
      if (part === 'body' && Math.hypot(x + 0.05, y - (by + br * 0.85), z + bl * 0.3) < 0.13) c.set(B2);
    } else if (P === 'tuxedo') {
      c.set(F);
      if (part === 'muzzle' || blaze(x, y, z, 0.1)) c.set(W);
      if (part === 'neck' || (part === 'chest' && y < by + br * 0.8)) c.set(W);
      if (part === 'body') c.lerp(_c2.set(W), under(y));
      if (part === 'leg') c.lerp(_c2.set(W), sst(0.13, 0.07, y));
    } else if (P === 'mask') {
      c.set(F);
      if (part === 'muzzle') c.set(B2);
      if (part === 'head') c.lerp(_c2.set(B2), sst(0.62, 0.92, hz(z)) * sst(0.1, -0.2, hy(y)) * 0.9 + sst(0.3, 0.1, Math.hypot(Math.abs(hx(x)) - 0.4, hy(y) - 0.12)) * 0.45);
      if (part === 'chest' && Math.abs(x) < 0.07 + (by - y) * 0.4) c.set(W);
      if (part === 'leg') c.lerp(_c2.set(W), sst(0.08, 0.04, y));
    } else if (P === 'blenheim') {
      c.set(F);
      if (head && part !== 'muzzle' && Math.abs(hx(x)) > 0.14 && hy(y) > -0.15) c.set(B2);
      if (part === 'body' && spot(x, y, z, 7, 0.55) && y > by) c.set(B2);
    } else if (P === 'merle') {
      c.set(F);
      if ((part === 'body' || part === 'head' || part === 'tail') && spot(x, y, z, 12, 0.66)) c.set(B2);
      if (part === 'muzzle' || part === 'cheek') c.set(lk.points || W);
      if (blaze(x, y, z, 0.08) && part === 'head') c.set(W);
      if (part === 'neck' || (part === 'chest' && y < by + br * 0.6)) c.set(W);
      if (part === 'leg') c.lerp(_c2.set(lk.points || W), sst(0.14, 0.05, y));
    } else if (P === 'saddle') {
      c.set(F);
      if (part === 'body' && y > by - br * 0.1 && Math.abs(z) < bl * 0.5 + br * 0.6) c.set(B2);
      if (part === 'head' && !blaze(x, y, z, 0.13) && hy(y) > -0.25) c.set(B2);
      if (part === 'head' && Math.hypot(Math.abs(hx(x)) - 0.4, hy(y) - 0.12) < 0.24) c.lerp(_c2.set(0x5a2a10), 0.6);
      if (part === 'tail') c.lerp(_c2.set(B2), 0.7);
    } else if (P === 'parti') {
      c.set(F);
      if (head && part !== 'muzzle' && Math.abs(hx(x)) > 0.2 && hy(y) > -0.25) c.set(B2);
      if (part === 'body' && y > by + br * 0.3 && z < 0) c.set(B2);
    } else if (P === 'husky') {
      c.set(F);
      if (part === 'body' && y > by + br * 0.35) c.set(B2);
      if (part === 'body' || part === 'chest' || part === 'neck') c.lerp(_c2.set(W), under(y));
      if (part === 'chest') c.lerp(_c2.set(W), sst(by + br * 0.6, by, y));
      if (part === 'muzzle' || part === 'cheek') c.set(W);
      if (part === 'head') {
        // masque blanc autour des yeux, la « pointe » sombre au milieu du front
        const mask = sst(0.5, 0.75, hz(z)) * sst(0.4, 0.1, hy(y));
        if (Math.abs(hx(x)) < 0.07 && hy(y) > -0.05) c.set(B2); else c.lerp(_c2.set(W), mask);
      }
      if (part === 'leg') c.lerp(_c2.set(W), 0.75);
      if (part === 'tail') c.lerp(_c2.set(W), sst(0, -0.1, y - TB.y) * 0.6);
    }
    if (lk.sandy && (part === 'leg' || part === 'muzzle')) c.lerp(_c2.set(0xd8b880), part === 'leg' ? sst(0.1, 0.02, y) * 0.8 : 0.0);
    if (part === 'paw') c.lerp(_c2.set(0x2a1a18), 0.0);
  };
  const furPart = (geo, o, part, bone, fluff) => k.add(geo, o, coat(part), bone, 'fur', fluff === undefined ? furLen : fluff);

  // ---- corps ----
  furPart(new THREE.CapsuleGeometry(br, bl, 8, Math.round(18 * k.det)), { y: by, rx: Math.PI / 2, sx: bw }, 'body', 'body');
  furPart(k.sph(br * 0.98, 20, 14), { y: by + br * 0.14, z: bl / 2 + br * 0.18, sx: bw * 0.98 }, 'chest', 'body');
  furPart(k.sph(br * 0.66, 16, 12), { x: NK.x, y: NK.y, z: NK.z }, 'neck', 'body');
  if (lk.mane) furPart(k.sph(br * 1.22, 20, 14), { y: NK.y - br * 0.05, z: NK.z - br * 0.1, sx: 1.1, sy: 0.95, sz: 0.85 }, 'neck', 'body', furLen * 1.8);
  if (fl > 0.7) furPart(k.sph(br * 0.75, 16, 12), { y: by + br * 0.05, z: bl / 2 + br * 0.55, sx: 0.9, sz: 0.7 }, 'chest', 'body', furLen * 1.5);
  // ---- pattes ----
  [['legFL', -1, LZF], ['legFR', 1, LZF], ['legBL', -1, LZB], ['legBR', 1, LZB]].forEach(([bone, sx, lz]) => {
    const x = sx * LX, len = Math.max(0.02, LT - lr * 2);
    furPart(new THREE.CapsuleGeometry(lr, len, 4, Math.round(10 * k.det)), { x, y: len / 2 + lr, z: lz }, 'leg', bone, furLen * 0.6);
    furPart(k.sph(lr * 1.22, 12, 8), { x, y: lr * 0.62, z: lz + lr * 0.4, sy: 0.62, sz: 1.15 }, 'leg', bone, 0);
    if (lk.puffs && fl > 0.9 && lk.tail === 'pompom') furPart(k.sph(lr * 1.75, 12, 10), { x, y: lr * 1.9, z: lz }, 'leg', bone, furLen * 1.4);
  });
  // ---- tête ----
  furPart(k.sph(hr, 28, 20), { x: H.x, y: H.y, z: H.z, sx: 1.06, sy: 0.96, sz: 0.97 }, 'head', 'head');
  furPart(k.sph(1, 18, 12), { x: MZ.x, y: MZ.y, z: MZ.z, sx: mzr.x, sy: mzr.y, sz: mzr.z }, 'muzzle', 'head', furLen * 0.4);
  // joues rondes (bébé) ; touffes de joues pour les poilus
  for (const s of [-1, 1]) furPart(k.sph(hr * 0.36, 14, 10), { x: s * hr * 0.42, y: H.y - hr * 0.3, z: H.z + hr * 0.46, sx: 1, sy: 0.85, sz: 0.8 }, 'cheek', 'head', furLen * (fl > 0.5 ? 1.4 : 0.5));
  if (lk.puffs) furPart(k.sph(hr * 0.5, 16, 12), { x: 0, y: H.y + hr * 0.72, z: H.z - hr * 0.05, sx: 1.1, sy: 0.8 }, 'head', 'head', furLen * 1.6);
  // ---- truffe, langue, joues roses ----
  const NOSE = lk.nose || 0x1c1416;
  const mzTip = MZ.z + mzr.z * 0.92;
  k.add(k.sph(1, 14, 10), { x: 0, y: MZ.y + mzr.y * 0.42, z: mzTip - hr * 0.02, sx: hr * 0.17, sy: hr * 0.12, sz: hr * 0.12 }, NOSE, 'head', 'gloss');
  k.add(k.sph(hr * 0.04, 6, 4), { x: hr * 0.06, y: MZ.y + mzr.y * 0.55, z: mzTip + hr * 0.07 }, 0xffffff, 'head', 'gloss');
  // la bouche : un petit trait sombre en « w »
  for (const s of [-1, 1]) k.add(new THREE.TorusGeometry(hr * 0.09, hr * 0.016, 4, 10, Math.PI), { x: s * hr * 0.085, y: MZ.y - mzr.y * 0.35, z: mzTip - hr * 0.05, rx: Math.PI, rz: 0 }, 0x3a2420, 'head', 'skin');
  if (lk.tongue || lk.blueTongue || lk.smile) k.add(k.sph(1, 12, 8), { x: 0, y: MZ.y - mzr.y * 0.72, z: mzTip - hr * 0.1, sx: hr * 0.12, sy: hr * 0.05, sz: hr * 0.16, rx: 0.5 }, lk.blueTongue ? 0x5a4aa0 : 0xf27088, 'head', 'skin');
  for (const s of [-1, 1]) k.add(k.sph(1, 10, 6), { x: s * hr * 0.55, y: H.y - hr * 0.2, z: H.z + hr * 0.72, sx: hr * 0.15, sy: hr * 0.08, sz: hr * 0.05, ry: s * 0.62 }, (x, y, z, c) => c.set(PINK).lerp(_c2.set(F), 0.35), 'head', 'skin');
  // ---- yeux : grands, sombres, deux reflets ----
  const er = hr * 0.205, ex = hr * 0.39, ey = H.y + hr * 0.1, ez = H.z + hr * 0.83;
  for (const s of [-1, 1]) {
    const ry = s * 0.42, fx = Math.sin(ry), fz = Math.cos(ry);
    const dark = new THREE.Color(F).getHSL({}).l < 0.2;
    const iris = lk.odd ? (s < 0 ? (lk.iris || 0x4aa0ff) : 0x5a3018) : (lk.iris || (dark ? 0x7a4a22 : 0x2a160c));
    k.add(k.sph(er, 16, 12), { x: s * ex, y: ey, z: ez, sx: 0.88, sy: 1.08, sz: 0.55, ry }, (x, y, z, c) => {
      // iris coloré au centre, pupille et bord sombres
      const d = Math.hypot(x - s * ex, y - ey) / er;
      c.set(iris).lerp(_c2.set(0x0c0806), sst(0.55, 0.95, d) * 0.9);
      if (lk.iris || lk.odd || dark) c.lerp(_c2.set(0x0c0806), sst(0.32, 0.18, d));
    }, 'eyes', 'gloss');
    k.add(k.sph(er * 0.36, 10, 8), { x: s * ex + fx * er * 0.4 - s * er * 0.05, y: ey + er * 0.42, z: ez + fz * er * 0.42 }, 0xffffff, 'eyes', 'gloss');
    k.add(k.sph(er * 0.15, 8, 6), { x: s * ex + fx * er * 0.42 + s * er * 0.3, y: ey - er * 0.34, z: ez + fz * er * 0.4 }, 0xffffff, 'eyes', 'gloss');
    if (lk.brows) k.add(k.sph(1, 10, 6), { x: s * hr * 0.38, y: ey + er * 1.35, z: ez - hr * 0.02, sx: hr * 0.2, sy: hr * 0.07, sz: hr * 0.12, rz: -s * 0.25 }, lk.brows, 'head', 'fur', furLen);
    else if (lk.pattern === 'points' || lk.pattern === 'husky') k.add(k.sph(1, 8, 6), { x: s * hr * 0.32, y: ey + er * 1.5, z: ez - hr * 0.05, sx: hr * 0.08, sy: hr * 0.055, sz: hr * 0.05 }, lk.pattern === 'husky' ? W : B2, 'head', 'skin');
  }
  // barbe (schnauzer, westie, shih tzu)
  if (lk.beard) {
    furPart(k.sph(1, 14, 10), { x: 0, y: MZ.y - mzr.y * 0.55, z: MZ.z + mzr.z * 0.15, sx: mzr.x * 0.95, sy: mzr.y * 1.1, sz: mzr.z * 0.8 }, 'muzzle', 'head', furLen * 1.6);
    for (const s of [-1, 1]) k.add(k.sph(1, 10, 8), { x: s * mzr.x * 0.6, y: MZ.y - mzr.y * 0.2, z: MZ.z + mzr.z * 0.45, sx: mzr.x * 0.55, sy: mzr.y * 0.75, sz: mzr.z * 0.5 }, lk.beard, 'head', 'fur', furLen * 1.2);
  }
  // ---- oreilles (chacune sur son os : elles ballottent) ----
  const ears = lk.ears || 'drop', el = lk.earLen || 1, earC = lk.earC;
  const earPaint = (x, y, z, c) => { coat('ear')(x, y, z, c); if (earC !== undefined) c.set(earC); if (lk.pattern === 'tricolor' || lk.pattern === 'mask') c.lerp(_c2.set(B2), lk.pattern === 'mask' ? 0.75 : 0.25); if (lk.pattern === 'husky' || lk.pattern === 'tuxedo') c.set(B2 !== F ? B2 : F); };
  const earAt = {};
  for (const s of [-1, 1]) {
    const bone = s < 0 ? 'earL' : 'earR';
    let at;
    if (ears === 'drop' || ears === 'long') {
      const long = ears === 'long';
      at = { x: s * hr * (long ? 0.8 : 0.8), y: H.y + hr * (long ? 0.28 : 0.4), z: H.z - hr * (long ? 0.1 : 0.04) };
      k.add(leafGeo(k, hr * (long ? 0.46 : 0.42), hr * (long ? 0.46 : 0.3) * el, hr * 0.16), { ...at, rz: s * (long ? 0.16 : 0.28), rx: 0.12, ry: s * 0.15 }, earPaint, bone, 'fur', furLen * (long && fl > 0.3 ? 1.8 : 0.7));
    } else if (ears === 'puff') {
      at = { x: s * hr * 0.78, y: H.y + hr * 0.3, z: H.z - hr * 0.05 };
      for (let i = 0; i < 3; i++) k.add(k.sph(hr * (0.27 - i * 0.02), 12, 10), { x: at.x + s * hr * 0.06, y: at.y - hr * (0.12 + i * 0.24), z: at.z }, earPaint, bone, 'fur', furLen * 1.5);
    } else {
      // dressées (prick), en chauve-souris (bat) ou repliées (fold)
      const bat = ears === 'bat', fold = ears === 'fold';
      at = { x: s * hr * (bat ? 0.56 : fold ? 0.55 : 0.47), y: H.y + hr * (bat ? 0.58 : 0.66), z: H.z - hr * (fold ? 0.02 : 0.1) };
      const w = hr * (bat ? 0.44 : fold ? 0.34 : 0.33), h = hr * (bat ? 0.66 : fold ? 0.5 : 0.72) * el, d = hr * 0.13, pt = bat ? 0.4 : fold ? 0.7 : 0.95;
      const o = { ...at, rz: -s * (bat ? 0.48 : fold ? 0.55 : 0.3), rx: fold ? 1.0 : -0.12 };
      k.add(pointGeo(k, w, h, d, pt), o, earPaint, bone, 'fur', furLen * 0.6);
      if (!fold) k.add(pointGeo(k, w * 0.6, h * 0.72, d * 0.5, pt), { ...o, z: at.z + hr * 0.06, y: at.y + hr * 0.04 }, (x, y, z, c) => c.set(PINK).lerp(_c2.set(F), 0.25), bone, 'skin');
    }
    earAt[s] = at;
  }
  // ---- queue ----
  const tail = lk.tail || 'wag', tip = lk.tailTip;
  const tailPaint = (x, y, z, c) => { coat('tail')(x, y, z, c); if (tip !== undefined) c.lerp(_c2.set(tip), sst(0.13, 0.2, Math.hypot(y - TB.y, z - TB.z))); };
  if (tail === 'curl') {
    const tg = new THREE.TorusGeometry(0.075, 0.048, 8, Math.round(16 * k.det), Math.PI * 1.55);
    k.add(tg, { x: 0, y: TB.y + 0.075, z: TB.z + 0.02, ry: Math.PI / 2, rz: -0.35 }, tailPaint, 'tail', 'fur', furLen * 1.4);
  } else if (tail === 'stub') {
    k.add(k.sph(0.05, 10, 8), { x: 0, y: TB.y + 0.02, z: TB.z - 0.01 }, tailPaint, 'tail', 'fur', furLen);
  } else if (tail === 'pompom') {
    const t = tailGeo(k, [[0, 0, 0], [0, 0.07, -0.04], [0, 0.14, -0.06]], 0.028, 0.022);
    k.add(t.g, { x: TB.x, y: TB.y, z: TB.z }, F, 'tail', 'fur', 0.004);
    k.add(k.sph(0.075, 12, 10), { x: 0, y: TB.y + t.end.y, z: TB.z + t.end.z }, F, 'tail', 'fur', furLen * 1.8);
  } else {
    const plume = tail === 'plume', whip = tail === 'whip';
    const pts = plume ? [[0, 0, 0], [0, 0.07, -0.09], [0, 0.1, -0.2], [0, 0.08, -0.29]] : whip ? [[0, 0, 0], [0, 0.06, -0.08], [0, 0.11, -0.17], [0, 0.17, -0.22]] : [[0, 0, 0], [0, 0.08, -0.06], [0, 0.17, -0.09], [0, 0.23, -0.08]];
    const t = tailGeo(k, pts, plume ? 0.045 : whip ? 0.036 : 0.042, plume ? 0.03 : whip ? 0.012 : 0.02);
    k.add(t.g, { x: TB.x, y: TB.y, z: TB.z }, tailPaint, 'tail', 'fur', plume ? furLen * 2.2 : furLen * 0.6);
  }
  // ---- accessoires ----
  const collarY = NK.y - br * 0.05, collarZ = NK.z - br * 0.02;
  if (lk.collar !== undefined || lk.barrel) {
    k.add(new THREE.TorusGeometry(br * 0.72, 0.024, 6, Math.round(22 * k.det)), { x: 0, y: collarY, z: collarZ, rx: Math.PI / 2 - 0.55, sx: 1.05 }, lk.collar !== undefined ? lk.collar : 0xc03030, 'body', 'skin');
    if (!lk.barrel) k.add(k.sph(0.032, 10, 8), { x: 0, y: collarY - br * 0.42, z: collarZ + br * 0.62 }, 0xffcc30, 'body', 'gloss');
  }
  if (lk.barrel) {
    k.add(new THREE.CylinderGeometry(0.055, 0.055, 0.12, Math.round(12 * k.det)), { x: 0, y: collarY - br * 0.6, z: collarZ + br * 0.55, rz: Math.PI / 2 }, (x, y, z, c) => c.set(Math.abs(x) > 0.04 ? 0x4a3020 : 0xa86a38), 'body', 'skin');
  }
  if (lk.bandana !== undefined) {
    k.add(new THREE.TorusGeometry(br * 0.74, 0.03, 6, Math.round(20 * k.det)), { x: 0, y: collarY, z: collarZ, rx: Math.PI / 2 - 0.55 }, lk.bandana, 'body', 'skin');
    k.add(new THREE.ConeGeometry(br * 0.62, 0.19, 3), { x: 0, y: collarY - 0.09, z: collarZ + br * 0.6, rx: Math.PI - 0.5, ry: Math.PI, sz: 0.35 }, (x, y, z, c) => c.set(lk.bandana).lerp(_c2.set(0xffffff), spot(x, y, z, 40, 0.8) ? 0.8 : 0), 'body', 'skin');
  }
  if (lk.scarf !== undefined) {
    k.add(new THREE.TorusGeometry(br * 0.76, 0.05, 8, Math.round(20 * k.det)), { x: 0, y: collarY, z: collarZ, rx: Math.PI / 2 - 0.5 }, (x, y, z, c) => c.set(lk.scarf).lerp(_c2.set(0xffffff), Math.sin(Math.atan2(z - collarZ, x) * 8) > 0.5 ? 0.85 : 0), 'body', 'fur', 0.006);
    k.add(new THREE.CapsuleGeometry(0.04, 0.12, 4, 8), { x: br * 0.5, y: collarY - 0.1, z: collarZ + br * 0.4, rz: 0.3, sz: 0.5 }, lk.scarf, 'body', 'fur', 0.004);
  }
  const bowC = lk.bow !== undefined ? lk.bow : lk.topknot;
  if (bowC !== undefined) {
    const top = lk.topknot !== undefined;
    const b = top ? { x: 0, y: H.y + hr * 1.05, z: H.z - hr * 0.05 } : { x: hr * 0.48, y: H.y + hr * 0.78, z: H.z + hr * 0.05 };
    if (top) furPart(k.sph(hr * 0.32, 12, 10), { x: 0, y: H.y + hr * 0.85, z: H.z - hr * 0.05, sy: 1.2 }, 'head', 'head', furLen * 1.6);
    for (const s of [-1, 1]) k.add(new THREE.ConeGeometry(hr * 0.2, hr * 0.38, 8), { x: b.x + s * hr * 0.17, y: b.y, z: b.z, rz: s * Math.PI / 2 }, bowC, 'head', 'skin');
    k.add(k.sph(hr * 0.09, 8, 6), b, (x, y, z, c) => c.set(bowC).multiplyScalar(0.85), 'head', 'skin');
  }

  // ---- squelette ----
  const W0 = {
    root: [0, 0, 0], body: [0, by, 0], head: [NK.x, NK.y + hr * 0.1, NK.z], tail: [TB.x, TB.y, TB.z],
    legFL: [-LX, LT, LZF], legFR: [LX, LT, LZF], legBL: [-LX, LT, LZB], legBR: [LX, LT, LZB],
    earL: [earAt[-1].x, earAt[-1].y, earAt[-1].z], earR: [earAt[1].x, earAt[1].y, earAt[1].z], eyes: [0, ey, ez],
  };
  const PARENT = { body: 'root', head: 'body', tail: 'body', legFL: 'body', legFR: 'body', legBL: 'body', legBR: 'body', earL: 'head', earR: 'head', eyes: 'head' };
  const bones = BONES.map(() => new THREE.Bone());
  BONES.forEach((n, i) => {
    const p = W0[n], q = PARENT[n] ? W0[PARENT[n]] : [0, 0, 0];
    bones[i].position.set(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    bones[i].name = n;
    if (PARENT[n]) bones[BI[PARENT[n]]].add(bones[i]);
  });
  const group = new THREE.Group();
  const meshes = [];
  const mk = (geo, mat) => {
    const m = new THREE.SkinnedMesh(geo, mat);
    m.castShadow = !opts.lite && !!opts.shadow; m.receiveShadow = !opts.lite;
    group.add(m); meshes.push(m);
    return m;
  };
  let main;
  if (opts.lite) main = mk(k.merge(() => true), furMaterial());
  else { main = mk(k.merge(q => !q.gloss), furMaterial()); mk(k.merge(q => q.gloss), glossMaterial()); }
  main.add(bones[0]);
  group.updateMatrixWorld(true);
  const skel = new THREE.Skeleton(bones);
  for (const m of meshes) m.bind(skel);
  const rig = Object.fromEntries(BONES.map((n, i) => [n, bones[i]]));
  rig.rest = Object.fromEntries(BONES.map((n, i) => [n, bones[i].position.clone()]));
  rig.dims = { by, br, bl, hr, legLen, H, ears, tail, earEl: el };
  group.scale.setScalar(lk.scale || 1);
  group.userData.pupMeshes = meshes;
  return { group, rig, meshes, height: (H.y + hr) * (lk.scale || 1) };
}

/**
 * Pose du chiot. a : { t, phase (marche), move 0..1, run 0..1, sit 0..1, lie 0..1,
 * wag 0..1, wagF (vitesse), hop (m), headYaw, headPitch, headRoll, eyes 0..1, earUp -1..1, earV }.
 */
export function posePup(rig, a) {
  const d = rig.dims, R = rig.rest;
  const sit = a.sit || 0, lie = a.lie || 0, mv = (a.move || 0) * (1 - lie), stand = 1 - Math.max(sit, lie);
  const sw = Math.sin(a.phase || 0), sw2 = Math.sin((a.phase || 0) + Math.PI);
  // corps : assis (penché en arrière), couché (le ventre au sol), sautillant
  const b = rig.body;
  b.position.copy(R.body);
  b.position.y += (a.hop || 0) + Math.abs(Math.sin((a.phase || 0))) * 0.035 * mv - sit * d.br * 0.25 - lie * (d.by - d.br * 0.82);
  b.position.z += -sit * d.br * 0.2;
  b.rotation.set(-sit * 0.62 + (a.bodyPitch || 0), 0, (a.bodyRoll || 0) + Math.sin(a.phase || 0) * 0.04 * mv);
  // pattes
  const L4 = [rig.legFL, rig.legFR, rig.legBL, rig.legBR];
  const swing = (a.run ? 0.95 : 0.7) * mv;
  L4.forEach((l, i) => {
    const front = i < 2, ph = (i === 0 || i === 3) ? sw : sw2;
    let rx = ph * swing;
    rx += front ? sit * 0.62 : -sit * 0.95;          // assis : pattes avant droites, arrière repliées vers l'avant
    rx += front ? -lie * 1.42 : lie * 1.3;            // couché : pattes avant devant, arrière derrière
    l.rotation.set(rx, 0, (front ? 0 : 0) + (i % 2 ? -1 : 1) * lie * 0.12);
    l.position.copy(R[BONES[4 + i]]);
    if (!front) l.position.y -= sit * 0.02;
  });
  // tête : regarde autour, penche la tête (« Ouaf ? »), compense quand il est assis
  const h = rig.head;
  h.position.copy(R.head);
  h.position.y += -lie * d.hr * 0.42 + Math.sin((a.phase || 0) * 2) * 0.012 * mv;
  h.position.z += lie * d.hr * 0.2;
  h.rotation.set(clamp(a.headPitch || 0, -0.7, 0.7) + sit * 0.55 + lie * 0.22, clamp(a.headYaw || 0, -1, 1), (a.headRoll || 0));
  // yeux (clignent, se ferment pour dormir)
  rig.eyes.scale.set(1, Math.max(0.08, a.eyes === undefined ? 1 : a.eyes), 1);
  // oreilles : dressées / tombantes / qui ballottent
  const up = a.earUp || 0, ev = a.earV || 0, t = a.t || 0;
  for (const s of [-1, 1]) {
    const e = s < 0 ? rig.earL : rig.earR;
    if (d.ears === 'drop' || d.ears === 'long' || d.ears === 'puff') {
      e.rotation.set(-ev * 0.8 + Math.sin(t * 9 + s) * 0.05 * mv - up * 0.15, 0, s * (-up * 0.25 + Math.min(0.5, Math.abs(ev)) * 0.6 + lie * 0.25));
    } else {
      e.rotation.set(-Math.max(0, -up) * 0.55 + ev * 0.2, 0, s * (Math.max(0, -up) * 0.35 + Math.sin(t * 7 + s) * 0.03 * mv));
    }
  }
  // queue
  const wag = a.wag || 0, wf = a.wagF || 12;
  const tl = rig.tail;
  if (d.tail === 'curl') tl.rotation.set(Math.sin(t * wf * 0.5) * 0.08 * wag, Math.sin(t * wf) * 0.35 * wag, 0);
  else tl.rotation.set(-0.15 + (1 - wag) * 0.5 * (a.sad || 0) + lie * 0.7 - sit * 0.4, Math.sin(t * wf) * (0.25 + 0.65 * wag), 0);
  void stand;
}

// ---------------------------------------------------------------------------
// Petits effets : cœurs qui s'envolent, « z » des siestes
// ---------------------------------------------------------------------------
function heartTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.translate(32, 34);
  x.beginPath();
  x.moveTo(0, 18); x.bezierCurveTo(-30, -2, -18, -26, 0, -12); x.bezierCurveTo(18, -26, 30, -2, 0, 18);
  x.fillStyle = '#ff4a7a'; x.fill();
  x.lineWidth = 4; x.strokeStyle = '#fff'; x.stroke();
  x.beginPath(); x.ellipse(-9, -9, 4, 6, -0.6, 0, TAU); x.fillStyle = 'rgba(255,255,255,0.7)'; x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function zTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.font = 'bold 50px Fredoka, Arial Rounded MT Bold, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.lineWidth = 7; x.strokeStyle = '#2a3a6a'; x.strokeText('z', 32, 34);
  x.fillStyle = '#e8f0ff'; x.fillText('z', 32, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ---------------------------------------------------------------------------
// Le Parc (niveau 1) : le coin des chiots, à côté de la niche de Mamie
// ---------------------------------------------------------------------------
const HUB = { x: -19.5, z: 53, rx: 7.5, rz: 6.5 };
const MODES = ['idle', 'walk', 'run', 'sit', 'sleep', 'happy'];

export class Puppies {
  constructor(game) {
    this.g = game;
    this.lite = !!game.lite;
    this.lost = [];
    this.hub = [];
    this.fx = [];
    this.known = null;
    const s = game.save;
    if (!Array.isArray(s.pups)) s.pups = [];
    // sa propre partie : un chiot déjà retrouvé ailleurs (chez un ami) est déjà au parc
    if (!game.guest) {
      const mine = rescuedIds().filter(id => id.startsWith('l' + L.ID + '_'));
      for (const id of mine) if (!s.pups.includes(id)) s.pups.push(id);
      // et l'inverse : ce qui a été trouvé dans ce monde est dans sa collection
      addRescued(s.pups);
    }
    for (const def of pupsOf(L.ID)) {
      if (s.pups.includes(def.id)) continue;
      this.lost.push(this.makeLost(def));
    }
    if (L.ID === 1) this.buildHub(game.guest ? [] : rescuedIds());
    this.shadowMat = null;
  }

  // ----------------------------------------------------------------- construction
  mesh(def, shadow) {
    const P = buildPup(def.look, { lite: this.lite, shadow });
    const g = this.g;
    if (!g.realistic) { T.toonify(P.group); T.outlineTree(P.group, 0.016, 0x2a1810); }
    g.scene.add(P.group);
    P.shR = 0.42 * (def.look.scale || 1) * Math.sqrt(def.look.chunky || 1);
    return P;
  }
  anim() { return { t: Math.random() * 10, phase: 0, move: 0, sit: 0, lie: 0, wag: 0.3, wagF: 10, hop: 0, headYaw: 0, headPitch: 0, headRoll: 0, eyes: 1, earUp: 0, earV: 0, blink: 2 + Math.random() * 3, sad: 0 }; }
  makeLost(def) {
    const P = this.mesh(def, true);
    const s = this.g.support(def.x, def.z, def.y + 0.8);
    const pos = new THREE.Vector3(def.x, s.y, def.z);
    const pose = def.look.pose || ({ l1_mirabelle: 'lie', l2_moka: 'lie', l2_banjo: 'lie', l4_flan: 'lie' }[def.id]) || 'sit';
    return { def, P, pos, home: pos.clone(), yaw: def.yaw || 0, state: 'lost', t: 0, a: this.anim(), pose, hintT: 1 + Math.random() * 2, excite: 0, look: 0, lookT: 0 };
  }

  /** Les chiots du parc (ceux qu'on a retrouvés). */
  buildHub(ids) {
    const want = new Set(ids);
    this.hub = this.hub.filter(h => {
      if (want.has(h.def.id)) return true;
      this.g.scene.remove(h.P.group);
      return false;
    });
    const have = new Set(this.hub.map(h => h.def.id));
    PUPS.forEach((def, i) => {
      if (!want.has(def.id) || have.has(def.id)) return;
      this.addHub(def, i);
    });
    this.ensureBalls();
  }
  addHub(def, i, from) {
    const P = this.mesh(def, false);
    const p = from ? from.clone() : this.lawnPoint(0.9);
    const h = { def, i, P, pos: new THREE.Vector3(p.x, L.heightAt(p.x, p.z), p.z), yaw: Math.random() * TAU, mode: 0, act: 'idle', t: 0, dur: 1 + Math.random() * 4, tgt: null, speed: 0, a: this.anim(), greetCd: 4 + Math.random() * 8, happyT: 0 };
    // au début : un tiers fait la sieste près de la niche
    if (!from && Math.random() < 0.3) this.startNap(h);
    this.hub.push(h);
    return h;
  }
  ensureBalls() {
    if (L.ID !== 1) return;
    const n = this.hub.length >= 2 ? (this.hub.length >= 10 ? 3 : 2) : 0;
    if (!this.balls) this.balls = [];
    while (this.balls.length < n) {
      const m = M.buildBall(); m.scale.setScalar(0.5);
      if (this.lite) m.traverse(o => { o.castShadow = false; });
      const p = this.lawnPoint(0.7);
      m.position.set(p.x, L.heightAt(p.x, p.z) + 0.16, p.z);
      this.g.scene.add(m);
      this.balls.push({ m, vx: 0, vz: 0, owner: null });
    }
  }

  // ----------------------------------------------------------------- le coin des chiots
  /** Un point libre de la pelouse des chiots (k : fraction du rayon). */
  lawnPoint(k) {
    for (let n = 0; n < 30; n++) {
      const a = Math.random() * TAU, r = Math.sqrt(Math.random()) * (k || 1);
      const x = HUB.x + Math.cos(a) * HUB.rx * r, z = HUB.z + Math.sin(a) * HUB.rz * r;
      if (this.freeAt(x, z)) return { x, z };
    }
    return { x: HUB.x, z: HUB.z };
  }
  freeAt(x, z) {
    for (const p of L.PORTALS || []) if (Math.hypot(p.x - x, p.z - z) < 2.6) return false;
    if (Math.hypot(L.KENNEL.x - x, L.KENNEL.z - z) < 1.9 || Math.hypot(L.npcs.mamie.x - x, L.npcs.mamie.z - z) < 1.6) return false;
    if (L.colliders.some(c => !c.off && L.inside(c, x, z, 0.4))) return false;
    return Math.abs(L.heightAt(x, z) - L.heightAt(HUB.x, HUB.z)) < 0.9;
  }
  napSpot() {
    const K = L.KENNEL;
    for (let n = 0; n < 20; n++) {
      const a = 1.7 + Math.random() * 2.2, r = 2.1 + Math.random() * 1.6;
      const x = K.x + Math.cos(a) * r, z = K.z + Math.sin(a) * r;
      if (this.freeAt(x, z) && !this.hub.some(h => h.act === 'nap' && h.tgt && Math.hypot(h.tgt.x - x, h.tgt.z - z) < 0.9)) return { x, z };
    }
    return this.lawnPoint(0.5);
  }
  startNap(h) { h.act = 'nap'; h.tgt = this.napSpot(); h.t = 0; h.dur = 14 + Math.random() * 18; }
  pickAct(h) {
    const awake = this.hub.filter(q => q !== h && q.act !== 'nap' && q.act !== 'greet');
    const r = Math.random();
    h.t = 0;
    if (r < 0.16) { this.startNap(h); return; }
    if (r < 0.36 && awake.length) {
      // jeu du chat : l'un poursuit, l'autre se sauve
      const q = awake[Math.floor(Math.random() * awake.length)];
      h.act = 'chase'; h.other = q; h.dur = 4 + Math.random() * 3;
      q.act = 'flee'; q.other = h; q.t = 0; q.dur = h.dur; q.tgt = null;
      return;
    }
    if (r < 0.58 && this.balls && this.balls.length) {
      const b = this.balls.reduce((m, x) => (!m || x.m.position.distanceTo(h.pos) < m.m.position.distanceTo(h.pos) ? x : m), null);
      h.act = 'ball'; h.ball = b; h.dur = 6 + Math.random() * 5; h.kicks = 0; return;
    }
    if (r < 0.8) { h.act = 'walk'; h.tgt = this.lawnPoint(1); h.dur = 12; return; }
    h.act = 'idle'; h.dur = 2 + Math.random() * 4; h.sit = Math.random() < 0.6;
  }

  /** Avance un chiot du parc vers (x, z). Rend la distance qui reste. */
  moveTo(h, x, z, speed, dt, stop) {
    const dx = x - h.pos.x, dz = z - h.pos.z, d = Math.hypot(dx, dz);
    if (d < (stop || 0.25)) { h.speed = ease(h.speed, 0, Math.min(1, dt * 8)); return d; }
    const sp = Math.min(speed, d * 3);
    h.speed = ease(h.speed, sp, Math.min(1, dt * 6));
    const nx = h.pos.x + dx / d * h.speed * dt, nz = h.pos.z + dz / d * h.speed * dt;
    if (this.freeAt(nx, nz) || !this.freeAt(h.pos.x, h.pos.z)) { h.pos.x = nx; h.pos.z = nz; } else { h.tgt = this.lawnPoint(1); h.speed = 0; }
    h.yaw = lerpAngle(h.yaw, Math.atan2(dx, dz), Math.min(1, dt * 9));
    return d;
  }

  stepHub(dt) {
    const g = this.g, players = g.players;
    for (const h of this.hub) {
      h.t += dt; h.greetCd -= dt; if (h.happyT > 0) h.happyT -= dt;
      // quelqu'un arrive : on court lui dire bonjour (pas si on dort)
      if (h.act !== 'greet' && h.act !== 'nap' && h.greetCd <= 0) {
        const P = players.find(Q => Math.hypot(Q.pos.x - h.pos.x, Q.pos.z - h.pos.z) < 7.5);
        if (P) { h.act = 'greet'; h.who = P; h.t = 0; h.dur = 5 + Math.random() * 3; h.barked = false; if (h.other) { h.other.act = 'idle'; h.other.t = 0; h.other.dur = 1; } }
      }
      let mode = 0;
      switch (h.act) {
        case 'greet': {
          const P = h.who;
          if (!P || !players.includes(P)) { h.act = 'idle'; break; }
          const d = this.moveTo(h, P.pos.x, P.pos.z, 4.2, dt, 1.4);
          if (d > 1.6) mode = 2;
          else {
            mode = 5; h.yaw = lerpAngle(h.yaw, Math.atan2(P.pos.x - h.pos.x, P.pos.z - h.pos.z), Math.min(1, dt * 8));
            if (!h.barked) { h.barked = true; h.happyT = 1.2; if (Math.random() < 0.7) this.yip(h); }
          }
          if (h.t > h.dur || Math.hypot(P.pos.x - h.pos.x, P.pos.z - h.pos.z) > 11) { h.act = 'idle'; h.t = 0; h.dur = 1.5; h.greetCd = 18 + Math.random() * 20; }
          break;
        }
        case 'nap': {
          const d = this.moveTo(h, h.tgt.x, h.tgt.z, 1.2, dt, 0.2);
          mode = d > 0.3 ? 1 : 4;
          if (h.t > h.dur) { h.act = 'idle'; h.t = 0; h.dur = 2; h.greetCd = 2; }
          break;
        }
        case 'chase': {
          const q = h.other;
          if (!q || q.act !== 'flee') { h.act = 'idle'; break; }
          const d = this.moveTo(h, q.pos.x, q.pos.z, 3.6, dt, 0.7);
          mode = 2;
          if (d < 0.8) {
            // attrapé ! on échange les rôles
            h.happyT = 0.8; q.happyT = 0.8;
            h.act = 'flee'; q.act = 'chase'; h.other = q; q.other = h; h.tgt = null; q.t = 0; h.t = 0;
          }
          if (h.t > h.dur) { h.act = 'idle'; h.t = 0; h.dur = 2 + Math.random() * 2; h.sit = true; q.act = 'idle'; q.t = 0; q.dur = 2; q.happyT = 1; }
          break;
        }
        case 'flee': {
          const q = h.other;
          if (!q || q.act !== 'chase') { h.act = 'idle'; break; }
          if (!h.tgt || Math.hypot(h.tgt.x - h.pos.x, h.tgt.z - h.pos.z) < 0.8) {
            // on se sauve à l'opposé du poursuivant (en restant sur la pelouse)
            const a = Math.atan2(h.pos.z - q.pos.z, h.pos.x - q.pos.x) + (Math.random() - 0.5) * 1.6;
            let x = h.pos.x + Math.cos(a) * 3.5, z = h.pos.z + Math.sin(a) * 3.5;
            if (((x - HUB.x) / HUB.rx) ** 2 + ((z - HUB.z) / HUB.rz) ** 2 > 1 || !this.freeAt(x, z)) { const p = this.lawnPoint(0.8); x = p.x; z = p.z; }
            h.tgt = { x, z };
          }
          this.moveTo(h, h.tgt.x, h.tgt.z, 3.2, dt, 0.3);
          mode = 2;
          break;
        }
        case 'ball': {
          const b = h.ball;
          if (!b) { h.act = 'idle'; break; }
          const bp = b.m.position;
          const d = this.moveTo(h, bp.x, bp.z, 3.2, dt, 0.45);
          mode = d > 0.5 ? 2 : 0;
          if (d < 0.55 && Math.hypot(b.vx, b.vz) < 0.6) {
            // un coup de museau : la balle roule
            const a = h.yaw + (Math.random() - 0.5) * 1.2, sp = 3 + Math.random() * 2.5;
            b.vx = Math.sin(a) * sp; b.vz = Math.cos(a) * sp; h.kicks++; h.happyT = 0.5;
            if (Math.random() < 0.3) this.yip(h, 0.5);
          }
          if (h.t > h.dur) { h.act = 'idle'; h.t = 0; h.dur = 2 + Math.random() * 2; h.sit = true; }
          break;
        }
        case 'walk': {
          const d = this.moveTo(h, h.tgt.x, h.tgt.z, 1.4, dt, 0.3);
          mode = d > 0.35 ? 1 : 0;
          if (d < 0.35 || h.t > h.dur) { h.act = 'idle'; h.t = 0; h.dur = 1.5 + Math.random() * 3; h.sit = Math.random() < 0.5; }
          break;
        }
        default: {
          h.speed = ease(h.speed, 0, Math.min(1, dt * 6));
          mode = h.sit ? 3 : 0;
          if (h.t > h.dur) this.pickAct(h);
        }
      }
      if (h.happyT > 0 && mode !== 2 && mode !== 1) mode = 5;
      h.mode = mode;
    }
    // ils ne se marchent pas dessus (ni sur les chiens des joueurs)
    for (let i = 0; i < this.hub.length; i++) {
      const a = this.hub[i];
      for (let j = i + 1; j < this.hub.length; j++) {
        const b = this.hub[j], dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 0.75) { const k = (0.75 - d) / d * 0.5; a.pos.x -= dx * k; a.pos.z -= dz * k; b.pos.x += dx * k; b.pos.z += dz * k; }
      }
      for (const P of players) {
        const dx = a.pos.x - P.pos.x, dz = a.pos.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d > 0.001 && d < 1.0 && Math.abs(P.pos.y - a.pos.y) < 1.5) { a.pos.x += dx / d * (1.0 - d); a.pos.z += dz / d * (1.0 - d); }
      }
      a.pos.y = L.heightAt(a.pos.x, a.pos.z);
    }
    // les balles roulent et ralentissent ; elles restent sur la pelouse
    for (const b of this.balls || []) {
      const p = b.m.position;
      p.x += b.vx * dt; p.z += b.vz * dt;
      const f = Math.exp(-dt * 1.4); b.vx *= f; b.vz *= f;
      if (((p.x - HUB.x) / (HUB.rx + 1)) ** 2 + ((p.z - HUB.z) / (HUB.rz + 1)) ** 2 > 1 || !this.freeAt(p.x, p.z)) { b.vx = (HUB.x - p.x) * 0.6; b.vz = (HUB.z - p.z) * 0.6; }
      for (const P of players) { const dx = p.x - P.pos.x, dz = p.z - P.pos.z, d = Math.hypot(dx, dz); if (d < 0.9 && d > 0.01 && Math.hypot(P.vel.x, P.vel.z) > 1) { b.vx = dx / d * 4 + P.vel.x * 0.5; b.vz = dz / d * 4 + P.vel.z * 0.5; } }
      p.y = L.heightAt(p.x, p.z) + 0.16;
      const sp = Math.hypot(b.vx, b.vz);
      if (sp > 0.05) { b.m.rotation.x += b.vz * dt * 6; b.m.rotation.z -= b.vx * dt * 6; }
    }
  }

  yip(h, vol) {
    const s = this.g.sfx;
    if (s && s.ok) {
      const d = h.pos.distanceTo(this.g.me.pos), v = (vol || 1) * clamp(1.2 - d / 18, 0, 1) * 0.09;
      const f = 1050 + (h.i % 5) * 70;
      if (v > 0.005) { s.tone(f, 0.06, { type: 'sawtooth', to: f * 1.35, vol: v }); s.tone(f * 1.1, 0.07, { type: 'sawtooth', to: f * 1.45, vol: v * 0.9, delay: 0.1 }); }
    }
    // une seule bulle à la fois (sinon le parc devient une cacophonie de « Ouaf ! »)
    if (Math.random() < 0.6 && this.g.t - (this.bubAt || -9) > 1.4) { this.bubAt = this.g.t; this.g.bubble({ pos: h.pos, mesh: h.P.group, small: true }, 'Ouaf !'); }
  }

  // ----------------------------------------------------------------- les chiots perdus (ce monde)
  /** Hôte / partie seule : on retrouve un chiot en le touchant. */
  step(dt) {
    const g = this.g;
    for (const p of this.lost) {
      if (p.state !== 'lost') continue;
      for (const Q of g.players) {
        if (Q.down) continue;
        const d = Math.hypot(Q.pos.x - p.pos.x, Q.pos.z - p.pos.z);
        if (d < 1.35 && Math.abs(Q.pos.y - p.pos.y) < 1.7) { this.rescue(p, Q); break; }
      }
    }
    if (L.ID === 1) this.stepHub(dt);
    this.stepLocal(dt);
  }
  /** Ami (monde partagé) : seulement les effets locaux, l'état vient de l'hôte. */
  guestStep(dt) {
    for (const h of this.hub) {
      if (h.net) {
        const k = 1 - Math.exp(-dt * 12);
        const dx = h.net[0] - h.pos.x, dz = h.net[1] - h.pos.z, d = Math.hypot(dx, dz);
        if (d > 5) { h.pos.x = h.net[0]; h.pos.z = h.net[1]; } else { h.pos.x += dx * k; h.pos.z += dz * k; }
        h.speed = ease(h.speed, Math.min(5, d * 6), Math.min(1, dt * 6));
        h.yaw = lerpAngle(h.yaw, h.net[2], k);
        h.pos.y = L.heightAt(h.pos.x, h.pos.z);
      }
    }
    for (const b of this.balls || []) if (b.net) { const p = b.m.position, k = 1 - Math.exp(-dt * 12); p.x += (b.net[0] - p.x) * k; p.z += (b.net[1] - p.z) * k; p.y = L.heightAt(p.x, p.z) + 0.16; }
    this.stepLocal(dt);
  }
  /** Indices (gémissement, « Ouaf ? »), qui marchent sur chaque écran pour son propre chien. */
  stepLocal(dt) {
    const g = this.g, me = g.me;
    const R = g.easy ? 30 : 16;           // Promenade : on entend les chiots de bien plus loin
    for (const p of this.lost) {
      p.t += dt;
      if (p.state === 'joy' && p.t > 2.3 && !g.dialog && !g.guest) {
        p.state = 'beam'; p.t = 0;
        g.sound('reveal');
        const n = pupsOf(L.ID).filter(d => g.save.pups.includes(d.id)).length;
        g.banner(`${p.def.name} file au Parc des Toutous !`, L.ID === 1 ? 'Rendez-vous près de la niche de Mamie !' : `Chiots de ce monde : ${n}/3 · au parc : ${rescuedIds().length}/${PUPS.length}`, 2600);
      }
      else if (p.state === 'beam' && p.t > 1.0 && !g.guest) { p.state = 'gone'; this.arrived(p); }
      if (p.state !== 'lost') continue;
      const d = Math.hypot(me.pos.x - p.pos.x, me.pos.z - p.pos.z, (me.pos.y - p.pos.y) * 0.7);
      p.excite = ease(p.excite, d < 7 ? 1 : 0, Math.min(1, dt * 3));
      if (d < R) {
        p.hintT -= dt;
        if (p.hintT <= 0) {
          p.hintT = (d < R * 0.4 ? 2.2 : 3.4) + Math.random() * 1.6;
          this.whimper(p, d, R);
          g.bubble({ pos: p.pos, mesh: p.P.group, small: true }, 'Ouaf ?');
          p.lookT = 1.4;
        }
      }
    }
  }
  whimper(p, d, R) {
    const s = this.g.sfx;
    if (!s || !s.ok) return;
    const v = clamp(1.15 - d / R, 0.15, 1) * 0.085;
    const f = 980 + (p.def.id.length % 4) * 60;
    // un petit gémissement qui descend, puis un « ouaf ? » qui remonte
    s.tone(f * 1.25, 0.32, { type: 'sine', to: f * 0.82, vol: v });
    s.tone(f * 1.25 * 1.005, 0.32, { type: 'triangle', to: f * 0.8, vol: v * 0.35 });
    s.tone(f * 0.9, 0.12, { type: 'sawtooth', to: f * 1.3, vol: v * 0.55, delay: 0.45 });
  }

  /** On l'a trouvé ! Joie, cœurs, fanfare, sa réplique… puis il file au parc. */
  rescue(p, Q) {
    const g = this.g, s = g.save;
    p.state = 'joy'; p.t = 0; p.yaw = Math.atan2(Q.pos.x - p.pos.x, Q.pos.z - p.pos.z);
    if (!s.pups.includes(p.def.id)) s.pups.push(p.def.id);
    addRescued([p.def.id]);
    if (this.known) this.known.add(p.def.id);
    g.persist();
    if (Q) Q.cheerT = 1.2;
    g.sound('pupYay');
    g.burst(p.pos.x, p.pos.y + 0.8, p.pos.z, 26, 0xffd23a, 4, 1.1);
    g.burst(p.pos.x, p.pos.y + 0.8, p.pos.z, 14, 0xff6a9a, 3, 1.2);
    const n = pupsOf(L.ID).filter(d => s.pups.includes(d.id)).length;
    const all = rescuedIds().length;
    const sub = `${p.def.name} (${p.def.breed}) · ${n}/3 dans ce monde · ${all}/${PUPS.length} au parc`;
    g.banner('🐶 Chiot retrouvé !', sub, 3200);
    setTimeout(() => { if (!g.disposed && !g.dialog) g.say([p.def.found]); }, 650);
  }
  /** Le chiot est arrivé au parc : au niveau 1, il apparaît près de la niche. */
  arrived(p) {
    const g = this.g;
    g.scene.remove(p.P.group);
    if (L.ID === 1) {
      const K = L.KENNEL, from = new THREE.Vector3(K.x - 2.2, 0, K.z + 2.2);
      const h = this.addHub(p.def, PUPS.indexOf(p.def), from);
      h.happyT = 2; h.greetCd = 0;
      g.burst(from.x, L.heightAt(from.x, from.z) + 0.6, from.z, 20, 0xfff2a0, 3, 0.9);
      this.ensureBalls();
    }
  }

  // ----------------------------------------------------------------- parler aux chiots du parc
  nearFor(Q) {
    if (L.ID !== 1) return null;
    let best = null, bd = 1.9;
    for (const h of this.hub) {
      const d = Math.hypot(h.pos.x - Q.pos.x, h.pos.z - Q.pos.z);
      if (d < bd && Math.abs(h.pos.y - Q.pos.y) < 2) { bd = d; best = h; }
    }
    return best ? { kind: 'pup', id: best.def.id, label: 'PARLER', x: best.pos.x, y: best.pos.y, z: best.pos.z } : null;
  }
  interact(n, P) {
    const h = this.hub.find(q => q.def.id === n.id);
    if (!h) return;
    h.act = 'greet'; h.who = P; h.t = 0; h.dur = 6; h.barked = true; h.happyT = 1.6;
    this.g.sound('yip');
    for (let i = 0; i < 6; i++) this.heart(h.pos.x, h.pos.y + 0.9, h.pos.z, i * 0.12);
    this.g.say([h.def.hub]);
  }

  // ----------------------------------------------------------------- monde partagé
  snapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    const out = { l: this.lost.map(p => ['lost', 'joy', 'beam', 'gone'].indexOf(p.state)) };
    if (L.ID === 1) {
      out.h = this.hub.map(h => [h.i, r(h.pos.x), r(h.pos.z), r(h.yaw), h.mode]);
      out.b = (this.balls || []).map(b => [r(b.m.position.x), r(b.m.position.z)]);
    }
    return out;
  }
  apply(x) {
    const ST = ['lost', 'joy', 'beam', 'gone'];
    (x.l || []).forEach((k, i) => {
      const p = this.lost[i];
      if (!p || ST[k] === p.state) return;
      p.state = ST[k]; p.t = 0;
      if (p.state === 'gone') this.g.scene.remove(p.P.group);
    });
    if (x.h) {
      const want = x.h.map(q => PUPS[q[0]] && PUPS[q[0]].id).filter(Boolean);
      if (want.length !== this.hub.length || this.hub.some((h, i) => h.def.id !== want[i])) {
        this.buildHub(want);
        // même ordre que chez l'hôte
        this.hub.sort((a, b) => want.indexOf(a.def.id) - want.indexOf(b.def.id));
      }
      x.h.forEach((q, i) => { const h = this.hub[i]; if (!h) return; if (!h.net) { h.pos.set(q[1], L.heightAt(q[1], q[2]), q[2]); h.yaw = q[3]; } h.net = [q[1], q[2], q[3]]; h.mode = q[4]; });
    }
    if (x.b && this.balls) x.b.forEach((q, i) => { const b = this.balls[i]; if (b) b.net = q; });
  }
  /** Ami : la sauvegarde du monde vient d'arriver ; les chiots qu'on voit retrouver vont aussi dans SA collection. */
  onSave() {
    const s = this.g.save;
    if (!Array.isArray(s.pups)) s.pups = [];
    if (!this.g.guest) return;
    if (!this.known) { this.known = new Set(s.pups); return; }
    const fresh = s.pups.filter(id => !this.known.has(id));
    for (const id of fresh) this.known.add(id);
    if (fresh.length) addRescued(fresh);
  }

  // ----------------------------------------------------------------- rendu
  heart(x, y, z, delay) {
    const g = this.g;
    if (!this.heartTex) this.heartTex = heartTexture();
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.heartTex, transparent: true, depthWrite: false, depthTest: false }));
    sp.userData.noOutline = true; sp.renderOrder = 9; sp.visible = false;
    g.scene.add(sp);
    this.fx.push({ sp, x: x + (Math.random() - 0.5) * 0.6, y, z: z + (Math.random() - 0.5) * 0.6, t: -(delay || 0), life: 1.3, vx: (Math.random() - 0.5) * 0.5, kind: 'heart' });
  }
  zzz(h) {
    const g = this.g;
    if (!this.zTex) this.zTex = zTexture();
    if (this.fx.filter(f => f.kind === 'z').length > 4) return;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.zTex, transparent: true, depthWrite: false }));
    sp.userData.noOutline = true; sp.renderOrder = 9;
    g.scene.add(sp);
    const hd = h.P.height;
    this.fx.push({ sp, x: h.pos.x + Math.sin(h.yaw) * 0.2, y: h.pos.y + hd * 0.6, z: h.pos.z + Math.cos(h.yaw) * 0.2, t: 0, life: 2.2, vx: 0.15, kind: 'z' });
  }
  /** Ombres douces sous les chiots : toutes dans un seul maillage instancié (un seul dessin). */
  shadowAt(pos, gy, r, hop, yaw) {
    if (!this.shIM) {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
      const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
      const mat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), color: 0x0a1a08, transparent: true, opacity: 0.34, depthWrite: false });
      this.shIM = new THREE.InstancedMesh(geo, mat, 40);
      this.shIM.renderOrder = 1; this.shIM.frustumCulled = false; this.shIM.userData.noOutline = true; this.shIM.count = 0;
      this.g.scene.add(this.shIM);
      this.shN = 0;
    }
    if (this.shN >= 40) return;
    const k = Math.max(0.4, 1 - (hop || 0) * 1.2) * r * 2.3;
    _m4.compose(_v.set(pos.x, gy + 0.035, pos.z), _q.setFromAxisAngle(_n.set(0, 1, 0), yaw || 0), _s.set(k, 1, k * 1.3));
    this.shIM.setMatrixAt(this.shN++, _m4);
  }
  shadowEnd() {
    if (!this.shIM) return;
    this.shIM.count = this.shN; this.shIM.instanceMatrix.needsUpdate = true; this.shN = 0;
  }
  render(dt) {
    const g = this.g, t = g.t;
    const me = g.me;
    // chiots perdus
    for (const p of this.lost) {
      const a = p.a, P = p.P;
      if (p.state === 'gone') continue;
      a.t += dt;
      let y = p.pos.y, sc = 1;
      if (p.state === 'lost') {
        // il attend, un peu triste ; il se redresse et remue la queue quand on approche
        p.lookT -= dt;
        const ex = p.excite, lying = p.pose === 'lie' && ex < 0.5;
        a.lie = ease(a.lie, lying ? 1 : 0, Math.min(1, dt * 4));
        a.sit = ease(a.sit, !lying && ex < 0.6 && p.pose !== 'stand' ? 1 : 0, Math.min(1, dt * 4));
        a.wag = ease(a.wag, 0.15 + ex * 0.85, Math.min(1, dt * 3)); a.wagF = 8 + ex * 12;
        a.sad = 1 - ex; a.earUp = -0.6 + ex * 1.2;
        const toMe = Math.atan2(me.pos.x - p.pos.x, me.pos.z - p.pos.z);
        const wantYaw = ex > 0.3 ? toMe : p.def.yaw || 0;
        p.yaw = lerpAngle(p.yaw, wantYaw, Math.min(1, dt * (ex > 0.3 ? 3 : 0.6)));
        a.headYaw = ease(a.headYaw, ex > 0.3 ? 0 : Math.sin(a.t * 0.5) * 0.7, Math.min(1, dt * 3));
        a.headPitch = ease(a.headPitch, p.lookT > 0 ? -0.35 : lying ? 0 : 0.12, Math.min(1, dt * 4));
        a.headRoll = ease(a.headRoll, p.lookT > 0 ? 0.32 : Math.sin(a.t * 0.37) * 0.12, Math.min(1, dt * 4));
        a.hop = ex > 0.8 ? Math.max(0, Math.sin(a.t * 7)) * 0.1 : 0;
        a.move = 0;
        a.eyes = this.blink(a, dt, p.pose === 'lie' && ex < 0.2 && p.def.id === 'l2_banjo');
      } else if (p.state === 'joy') {
        // il saute de joie et tourne sur lui-même
        a.lie = ease(a.lie, 0, Math.min(1, dt * 8)); a.sit = ease(a.sit, 0, Math.min(1, dt * 8));
        const k = p.t;
        a.hop = Math.abs(Math.sin(k * 7.5)) * 0.55 * (k < 2.2 ? 1 : 0.3);
        a.wag = 1; a.wagF = 26; a.earUp = 0.6; a.earV = Math.cos(k * 7.5) * 0.6; a.sad = 0;
        a.headPitch = -0.25; a.headRoll = Math.sin(k * 4) * 0.2; a.headYaw = 0;
        p.yaw += dt * (k > 0.6 && k < 1.5 ? 9 : 0.5);
        a.eyes = Math.sin(k * 7.5) > 0.6 ? 0.25 : 1;    // yeux plissés de bonheur
        if (Math.random() < dt * 9) this.heart(p.pos.x, p.pos.y + 1.0 + a.hop, p.pos.z, 0);
        if (Math.random() < dt * 14) g.spawnParticle(p.pos.x + (Math.random() - 0.5), p.pos.y + 0.3 + Math.random(), p.pos.z + (Math.random() - 0.5), 0, 1.2, 0, 0xffe27a, 0.18, 0.8, 0);
      } else if (p.state === 'beam') {
        // il s'envole dans un tourbillon d'étoiles vers le parc
        const k = clamp(p.t / 1.0, 0, 1);
        y += k * k * 5; sc = 1 - k * k * 0.9; p.yaw += dt * 14;
        a.hop = 0; a.wag = 1; a.eyes = 0.25; a.earV = -0.8;
        for (let i = 0; i < 2; i++) { const an = Math.random() * TAU; g.spawnParticle(p.pos.x + Math.cos(an) * 0.5, y + 0.4, p.pos.z + Math.sin(an) * 0.5, Math.cos(an) * 0.6, 2.5, Math.sin(an) * 0.6, i ? 0xffffff : 0xffd23a, 0.2, 0.9, 0); }
      }
      posePup(P.rig, a);
      P.group.position.set(p.pos.x, y, p.pos.z);
      P.group.rotation.y = p.yaw;
      P.group.scale.setScalar((p.def.look.scale || 1) * sc);
      if (p.state !== 'beam') this.shadowAt(p.pos, g.support(p.pos.x, p.pos.z, p.pos.y + 0.1).y, P.shR, a.hop, p.yaw);
    }
    // le parc
    for (const h of this.hub) {
      const a = h.a, P = h.P, mode = MODES[h.mode] || 'idle';
      a.t += dt;
      const moving = mode === 'walk' || mode === 'run';
      a.phase += dt * (h.speed * 7.5 + (moving ? 2 : 0));
      a.move = ease(a.move, moving ? 1 : 0, Math.min(1, dt * 8)); a.run = mode === 'run';
      a.sit = ease(a.sit, mode === 'sit' ? 1 : 0, Math.min(1, dt * 4));
      a.lie = ease(a.lie, mode === 'sleep' ? 1 : 0, Math.min(1, dt * 3));
      a.wag = ease(a.wag, mode === 'sleep' ? 0 : mode === 'happy' || mode === 'run' ? 1 : 0.45, Math.min(1, dt * 4));
      a.wagF = mode === 'happy' ? 24 : 13;
      a.hop = mode === 'happy' ? Math.max(0, Math.sin(a.t * 9)) * 0.22 : 0;
      a.earUp = mode === 'sleep' ? -0.3 : mode === 'happy' ? 0.5 : 0.1;
      a.earV = ease(a.earV, moving ? Math.sin(a.phase) * 0.4 : mode === 'happy' ? Math.cos(a.t * 9) * 0.5 : 0, Math.min(1, dt * 10));
      a.headPitch = ease(a.headPitch, mode === 'sleep' ? 0.1 : mode === 'happy' ? -0.3 : mode === 'idle' ? Math.sin(a.t * 0.8 + h.i) * 0.25 + 0.15 : 0, Math.min(1, dt * 4));
      a.headYaw = ease(a.headYaw, mode === 'idle' || mode === 'sit' ? Math.sin(a.t * 0.45 + h.i * 1.7) * 0.6 : 0, Math.min(1, dt * 3));
      a.headRoll = ease(a.headRoll, mode === 'happy' ? Math.sin(a.t * 4) * 0.25 : mode === 'sit' ? Math.sin(a.t * 0.3 + h.i) * 0.2 : 0, Math.min(1, dt * 4));
      a.sad = 0;
      a.eyes = this.blink(a, dt, mode === 'sleep');
      if (mode === 'sleep') {
        h.zT = (h.zT || Math.random() * 2) - dt;
        if (h.zT <= 0) { h.zT = 1.6 + Math.random(); if (h.pos.distanceTo(me.pos) < 18) this.zzz(h); }
        a.headYaw = 0;
      }
      posePup(P.rig, a);
      P.group.position.copy(h.pos);
      P.group.rotation.y = h.yaw;
      this.shadowAt(h.pos, h.pos.y, P.shR, a.hop, h.yaw);
    }
    this.shadowEnd();
    // cœurs, « z »
    this.fx = this.fx.filter(f => {
      f.t += dt;
      if (f.t < 0) return true;
      f.sp.visible = true;
      const k = f.t / f.life;
      if (f.kind === 'heart') { f.y += dt * 1.3; f.x += f.vx * dt; const s = 0.32 * Math.min(1, f.t * 6) * (1 - k * 0.3); f.sp.scale.set(s, s, 1); }
      else { f.y += dt * 0.45; f.x += Math.sin(f.t * 2.5) * 0.004; const s = 0.18 + k * 0.22; f.sp.scale.set(s, s, 1); }
      f.sp.position.set(f.x, f.y, f.z);
      f.sp.material.opacity = Math.min(1, (1 - k) * 2.5);
      if (k >= 1) { g.scene.remove(f.sp); f.sp.material.dispose(); return false; }
      return true;
    });
    void t;
  }
  blink(a, dt, sleep) {
    if (sleep) return ease(a.eyes === undefined ? 1 : a.eyes, 0.08, Math.min(1, dt * 4));
    a.blink -= dt;
    if (a.blink < 0) { if (a.blink < -0.13) a.blink = 2.5 + Math.random() * 3.5; return 0.1; }
    return 1;
  }

  // ----------------------------------------------------------------- compteurs (pause)
  /** « Chiots perdus 1/3 : Pistou · ? · ? » pour la pause. */
  pauseLine() {
    const s = this.g.save, list = pupsOf(L.ID);
    const got = list.filter(d => (s.pups || []).includes(d.id));
    const names = list.map(d => ((s.pups || []).includes(d.id) ? '🐶 ' + d.name : '❔')).join(' · ');
    const park = L.ID === 1 ? ` · au parc : ${this.g.guest ? this.hub.length : rescuedIds().length}/${PUPS.length}` : '';
    return `Chiots : ${got.length}/${list.length} — ${names}${park}`;
  }
  dispose() {
    for (const f of this.fx) this.g.scene.remove(f.sp);
    this.fx = [];
  }
}
