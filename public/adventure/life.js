/*
 * Matcha & Ainu — la « couche de vie » d'un monde (réutilisable par tous les niveaux).
 *
 * Un monde qui fourmille, façon Nintendo : des bêtes qui se promènent, fuient, s'envolent
 * quand on aboie, se laissent caresser ; des objets à secouer, à casser, à faire sonner,
 * à pousser ; des trampolines ; des défis éclair (pièces rouges, anneaux, courses…) ;
 * des traînées de paillettes ; des habitants occupés ; des coffres cachés.
 *
 * Tout est décrit par des données (un plan fait par lifeplan.js + une palette par monde) et
 * dessiné par maillages instanciés (un seul appel de dessin par sorte d'objet) ; seuls les
 * objets proches du chien sont animés, les lointains dorment.
 *
 * Utilisation (dans le constructeur d'un niveau, voir snow.js) :
 *   const life = buildLife(game, { L, plan, palette, lines, hooks });
 *   logic.step(dt)   → life.step(dt)            (hôte : défis, objets, récompenses)
 *   logic.render(dt) → life.render(dt, t)       (tout le monde : bêtes, habitants, animations)
 *   extraCandidates  → ...life.candidates(Q) ; interact(n) → if (n.life) life.interact(n, P)
 *   snapshot / apply → life.snapshot() / life.apply(x) ; applySave → life.applySave()
 *   questText        → life.questText() || … ; minimapMarks → ...life.marks()
 * Sauvegarde : game.save.life = { defis: [], chests: [], gone: {}, talk: {}, pets }.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as FOL from './foliage.js';
import * as M from './models.js';
import * as RT from './realtex.js';
import { PointGrid } from './lifeplan.js';
import * as KIT from './lifekit.js';
import * as FACE from './lifeface.js';
let firMatCache = null;
const firMat = () => firMatCache || (firMatCache = FOL.firMaterials({ snow: 0.7 }));

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const REGROW_MS = 8 * 60 * 1000;
const TAU = Math.PI * 2;

// ===========================================================================
// Petit kit de géométrie : formes peintes (couleur par sommet), fusionnées
// ===========================================================================
function paint(geo, color) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const n = g.attributes.position.count, col = new Float32Array(n * 3), c = new THREE.Color(color);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  // (on garde les coordonnées de texture : un monde peut habiller ses bêtes et ses objets de vraies matières)
  return g;
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
/** P(géométrie, couleur, { x, y, z, sx, sy, sz, rx, ry, rz }) : une pièce peinte et placée. */
function P(geo, color, o) {
  o = o || {};
  const g = paint(geo, color);
  _m.compose(_v.set(o.x || 0, o.y || 0, o.z || 0), _q.setFromEuler(_e.set(o.rx || 0, o.ry || 0, o.rz || 0, 'YXZ')), _s.set(o.sx || o.s || 1, o.sy || o.s || 1, o.sz || o.s || 1));
  g.applyMatrix4(_m);
  if (o.uvKeep) g.userData.uvKeep = true;   // (un tableau, une affiche : ses propres coordonnées de texture, pas « en boîte »)
  // (o.rig = [code, px, py, pz] : pièce animée — œil, oreille, queue ; o.neck = [x, y, z] : pièce de la tête — voir lifeface.js)
  if (o.rig) FACE.tag(g, o.rig[0], o.rig[1], o.rig[2], o.rig[3]);
  if (o.neck) FACE.neck(g, o.neck[0], o.neck[1], o.neck[2]);
  return g;
}
function merge(list) {
  const out = new THREE.BufferGeometry();
  for (const [name, k] of [['position', 3], ['normal', 3], ['color', 3], ['uv', 2]]) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const a = new Float32Array(n * k); let o = 0;
    for (const g of list) { const at = g.attributes[name]; if (at) a.set(at.array, o); o += g.attributes.position.count * k; }
    if (name !== 'uv') out.setAttribute(name, new THREE.BufferAttribute(a, k));
  }
  // coordonnées de texture « en boîte » (1 unité = 1 m) : une matière de détail (grain, fourrure,
  // bois…) peut ainsi habiller n'importe quel modèle peint (cfg.mats, mdl.mat)
  const pos = out.attributes.position.array, nor = out.attributes.normal.array, nn = pos.length / 3, uv = new Float32Array(nn * 2);
  for (let i = 0; i < nn; i++) {
    const ax = Math.abs(nor[i * 3]), ay = Math.abs(nor[i * 3 + 1]), az = Math.abs(nor[i * 3 + 2]);
    if (ay >= ax && ay >= az) { uv[i * 2] = pos[i * 3]; uv[i * 2 + 1] = pos[i * 3 + 2]; }
    else if (ax >= az) { uv[i * 2] = pos[i * 3 + 2]; uv[i * 2 + 1] = pos[i * 3 + 1]; }
    else { uv[i * 2] = pos[i * 3]; uv[i * 2 + 1] = pos[i * 3 + 1]; }
  }
  let o = 0;
  for (const g of list) { if (g.userData.uvKeep && g.attributes.uv) uv.set(g.attributes.uv.array, o * 2); o += g.attributes.position.count; }
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  FACE.mergeRig(list, out);
  out.computeBoundingSphere();
  return out;
}
/** Plusieurs listes de pièces → une géométrie à groupes (une matière par liste : bois + métal…). */
function mergeGroups(lists) {
  const g = merge(lists.flat());
  let o = 0;
  lists.forEach((l, i) => { const n = l.reduce((a, q) => a + q.attributes.position.count, 0); g.addGroup(o, n, i); o += n; });
  return g;
}
/** Une forme tournée (vase, tonneau…) : profil [[rayon, y], …]. */
const lathe = (prof, n) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), n || 12);
const sph = (r, w, h, ...a) => new THREE.SphereGeometry(r, w || 8, h || 6, ...a);
const cyl = (a, b, h, n, ...o) => new THREE.CylinderGeometry(a, b, h, n || 6, ...o);
const cone = (r, h, n) => new THREE.ConeGeometry(r, h, n || 6);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const tor = (r, t, a, b, arc) => new THREE.TorusGeometry(r, t, a || 6, b || 16, arc);

// ---------------------------------------------------------------------------
// Matières : la couleur vient des sommets, le grain d'une vraie texture (sable, bois, tissu,
// pelage, roche…) plaquée en « triplanaire » dans le repère de l'objet (pas besoin d'UV).
// Fini le « jouet en plastique » : chaque sorte d'objet peut choisir sa peau (palette : skin).
// ---------------------------------------------------------------------------
const SKIN_CACHE = {};
/** Une texture de grain en niveaux de gris (moyenne ~0,5) ; dessinée, ou tirée d'une photo. */
function skinCanvas(kind) {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const x = c.getContext('2d');
  let s = 97 + kind.length * 31; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const photoKey = { wood: 'brown_planks_03_d', rock: 'mossy_rock_d', bark: 'bark_willow_02_d', stone: 'stone_pathway_d' }[kind];
  const ph = photoKey && RT.photoImage(photoKey);
  if (ph) {
    // photo → gris normalisé (on garde le grain, la couleur vient des sommets)
    x.drawImage(ph, 0, 0, N, N);
    const img = x.getImageData(0, 0, N, N), p = img.data;
    let sum = 0; for (let i = 0; i < p.length; i += 4) sum += p[i] * 0.3 + p[i + 1] * 0.55 + p[i + 2] * 0.15;
    const k = 128 / (sum / (p.length / 4));
    for (let i = 0; i < p.length; i += 4) { const l = Math.min(255, (p[i] * 0.3 + p[i + 1] * 0.55 + p[i + 2] * 0.15) * k); p[i] = p[i + 1] = p[i + 2] = l; }
    x.putImageData(img, 0, 0);
    return c;
  }
  x.fillStyle = '#808080'; x.fillRect(0, 0, N, N);
  const dot = (px, py, w, h, v, a) => { x.fillStyle = `rgba(${v},${v},${v},${a})`; x.fillRect(px, py, w, h); };
  if (kind === 'sand' || kind === 'grain') {
    for (let i = 0; i < 9000; i++) dot(r() * N, r() * N, 1 + r() * 1.6, 1 + r() * 1.6, r() < 0.5 ? 40 + r() * 60 : 190 + r() * 65, 0.35);
    for (let i = 0; i < 200; i++) dot(r() * N, r() * N, 2, 2, 250, 0.6);
  } else if (kind === 'wood' || kind === 'bark') {
    for (let y = 0; y < N; y += 2) { const v = 128 + Math.sin(y * 0.21 + Math.sin(y * 0.05) * 4) * 40 + (r() - 0.5) * 30; dot(0, y, N, 2, v | 0, 0.7); }
    for (let i = 0; i < 40; i++) { const y = r() * N; x.strokeStyle = 'rgba(30,30,30,0.35)'; x.beginPath(); x.moveTo(0, y); x.bezierCurveTo(N * 0.3, y + 6, N * 0.6, y - 6, N, y + (r() - 0.5) * 8); x.stroke(); }
  } else if (kind === 'fabric') {
    for (let y = 0; y < N; y += 2) for (let xx = 0; xx < N; xx += 2) dot(xx, y, 2, 2, ((xx + y) / 2) % 2 ? 150 + r() * 25 : 100 + r() * 25, 1);
    for (let i = 0; i < 1500; i++) dot(r() * N, r() * N, 1, 3, 200, 0.15);
  } else if (kind === 'fur') {
    for (let i = 0; i < 5000; i++) { const px = r() * N, py = r() * N, v = r() < 0.5 ? 70 + r() * 40 : 170 + r() * 60; x.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},0.5)`; x.beginPath(); x.moveTo(px, py); x.lineTo(px + (r() - 0.5) * 3, py + 3 + r() * 5); x.stroke(); }
  } else if (kind === 'skin' || kind === 'shell') {
    for (let i = 0; i < 2500; i++) dot(r() * N, r() * N, 2 + r() * 3, 2 + r() * 3, 90 + r() * 80, 0.25);
    if (kind === 'shell') for (let y = 0; y < N; y += 6) dot(0, y, N, 1.5, 70, 0.35);
  } else if (kind === 'feather') {
    // plumes : écailles en quinconce, bord sombre
    for (let j = -1; j < N / 10 + 1; j++) for (let i = -1; i < N / 12 + 1; i++) {
      const cx = i * 12 + (j % 2) * 6, cy = j * 10, g = x.createRadialGradient(cx, cy, 1, cx, cy, 9), v = 150 + r() * 40;
      g.addColorStop(0, `rgb(${v | 0},${v | 0},${v | 0})`); g.addColorStop(0.8, `rgb(${(v - 40) | 0},${(v - 40) | 0},${(v - 40) | 0})`); g.addColorStop(1, 'rgb(60,60,60)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, 8.5, 0, Math.PI); x.fill();
    }
  } else if (kind === 'straw') {
    // paille : longs brins clairs et sombres, presque à plat
    for (let i = 0; i < 1600; i++) { const px = r() * N, py = r() * N, l = 12 + r() * 36, a = (r() - 0.5) * 0.7, v = r() < 0.5 ? 60 + r() * 50 : 170 + r() * 70; x.strokeStyle = `rgba(${v | 0},${v | 0},${v | 0},0.6)`; x.lineWidth = 1 + r() * 1.6; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke(); }
  } else if (kind === 'leaf') {
    // feuillage : petites feuilles serrées
    for (let i = 0; i < 1400; i++) { const v = 50 + r() * 170; x.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.8)`; x.beginPath(); x.ellipse(r() * N, r() * N, 3 + r() * 3, 1.5 + r() * 1.5, r() * 6.28, 0, 6.28); x.fill(); }
  } else if (kind === 'mud') {
    for (let i = 0; i < 90; i++) { const v = 60 + r() * 140, rr = 4 + r() * 18; x.fillStyle = `rgba(${v | 0},${v | 0},${v | 0},0.45)`; x.beginPath(); x.ellipse(r() * N, r() * N, rr, rr * (0.5 + r() * 0.5), r() * 3, 0, 6.28); x.fill(); }
  } else if (kind === 'pumpkin') {
    // côtes de citrouille (dans le sens vertical) et petites taches
    for (let i = 0; i < N; i++) { const v = 70 + Math.abs(Math.sin(i / N * Math.PI * 8)) * 110; dot(i, 0, 1, N, v | 0, 1); }
    for (let i = 0; i < 600; i++) dot(r() * N, r() * N, 2, 1, 220, 0.25);
  } else {   // rock, stone (sans photo)
    for (let i = 0; i < 1800; i++) dot(r() * N, r() * N, 3 + r() * 7, 3 + r() * 7, 60 + r() * 140, 0.22);
    for (let i = 0; i < 6000; i++) dot(r() * N, r() * N, 1, 1, r() * 255, 0.3);
  }
  return c;
}
/**
 * Matière à grain (lit) : opts { roughness, scale (répétitions par mètre), k (force du grain), side, metal }.
 * Les géométries « peintes » n'ont pas d'UV : on échantillonne la texture sur les trois plans de
 * l'objet (position locale, avant l'instanciation : le grain suit l'objet quand il bouge).
 */
export function skinMaterial(kind, opts) {
  opts = opts || {};
  const key = kind + ':' + (opts.side || 0) + ':' + (opts.roughness || 0.8) + ':' + (opts.k || 0.7) + ':' + (opts.scale || 2);
  if (SKIN_CACHE[key]) return SKIN_CACHE[key];
  const tex = new THREE.CanvasTexture(skinCanvas(kind));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: opts.roughness || 0.8, metalness: opts.metal || 0, side: opts.side || THREE.FrontSide });
  const U = { uSkin: { value: tex }, uSkinS: { value: opts.scale || 2 }, uSkinK: { value: opts.k === undefined ? 0.7 : opts.k } };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkP;\nvarying vec3 vSkN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSkP = position; vSkN = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uSkin;\nuniform float uSkinS, uSkinK;\nvarying vec3 vSkP;\nvarying vec3 vSkN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec3 bw = pow(abs(normalize(vSkN)), vec3(4.0)); bw /= (bw.x + bw.y + bw.z + 1e-4);
          vec3 p = vSkP * uSkinS;
          float g = texture2D(uSkin, p.zy).r * bw.x + texture2D(uSkin, p.xz).r * bw.y + texture2D(uSkin, p.xy).r * bw.z;
          diffuseColor.rgb *= mix(1.0, g * 2.0, uSkinK);
        }`);
  };
  m.customProgramCacheKey = () => 'life-skin';
  return (SKIN_CACHE[key] = m);
}

/** Une paire d'yeux noirs (et un reflet) sur une tête. */
const eyes = (x, y, z, r) => [P(sph(r, 6, 4), 0x141414, { x, y, z, rig: [FACE.RIG.EYE, x, y, z] }), P(sph(r, 6, 4), 0x141414, { x: -x, y, z, rig: [FACE.RIG.EYE, -x, y, z] })];

// ---------------------------------------------------------------------------
// Bestiaire : chaque modèle renvoie { body, flap?, pivots?, h, r } (pieds en y = 0, regard vers +z).
// « flap » : une aile / nageoire / bras (une seule moitié, pivot à l'origine, vers +x),
// dessinée deux fois (miroir) et animée.
// ---------------------------------------------------------------------------
const wingGeo = (len, w, col) => merge([P(sph(0.5, 8, 4), col, { x: len * 0.5, sx: len, sy: 0.18 * w, sz: w })]);
/** Aile d'oiseau en plumes étagées (couvertures, puis rémiges de plus en plus fines au bout) : pas une planche. */
const featherWing = (len, w, col, tip) => {
  const parts = [P(sph(0.5, 8, 4), col, { x: len * 0.32, sx: len * 0.68, sy: 0.16 * w, sz: w * 0.95 }), P(sph(0.5, 8, 4), col, { x: len * 0.55, z: -w * 0.12, sx: len * 0.7, sy: 0.12 * w, sz: w * 0.7 })];
  for (let i = 0; i < 4; i++) parts.push(P(sph(0.5, 6, 3), tip, { x: len * (0.68 + i * 0.12), z: -w * (0.22 + i * 0.07), sx: len * (0.55 - i * 0.06), sy: 0.07 * w, sz: w * 0.3, ry: -0.25 - i * 0.12 }));
  return merge(parts);
};
export const MODELS = {
  hare(c) {
    const fur = c.fur || 0xffffff, tip = c.tip || 0x2a2a2e;
    return {
      body: merge([P(sph(0.28), fur, { y: 0.3, sz: 1.25, sy: 0.92 }), P(sph(0.18), fur, { y: 0.55, z: 0.26 }),
        P(sph(0.06), fur, { x: 0.07, y: 0.8, z: 0.18, sy: 3.4, rx: -0.35, rz: -0.15, rig: [FACE.RIG.EAR_R, 0.06, 0.62, 0.24] }), P(sph(0.06), fur, { x: -0.07, y: 0.8, z: 0.18, sy: 3.4, rx: -0.35, rz: 0.15, rig: [FACE.RIG.EAR_L, -0.06, 0.62, 0.24] }),
        P(sph(0.035), tip, { x: 0.1, y: 0.99, z: 0.1, rig: [FACE.RIG.EAR_R, 0.06, 0.62, 0.24] }), P(sph(0.035), tip, { x: -0.1, y: 0.99, z: 0.1, rig: [FACE.RIG.EAR_L, -0.06, 0.62, 0.24] }),
        ...eyes(0.1, 0.59, 0.38, 0.032), P(sph(0.028), 0xf09aa8, { y: 0.53, z: 0.44 }),
        P(sph(0.09), 0xffffff, { y: 0.36, z: -0.34, rig: [FACE.RIG.TAIL, 0, 0.34, -0.28] }), P(sph(0.08), fur, { x: 0.13, y: 0.06, z: -0.06, sz: 2.2 }), P(sph(0.08), fur, { x: -0.13, y: 0.06, z: -0.06, sz: 2.2 })]),
      h: 1.0, r: 0.35, skin: 'fur',
    };
  },
  bird(c) {
    const back = c.back || 0x6a7080, breast = c.breast || 0xe8503a, cap = c.cap || 0x1a1a20;
    return {
      body: merge([P(sph(0.11), back, { y: 0.15, sz: 1.3, sy: 0.95 }), P(sph(0.1), breast, { y: 0.13, z: 0.05, sx: 0.92 }), P(sph(0.078), cap, { y: 0.27, z: 0.1 }),
        P(cone(0.03, 0.08, 5), c.beak || 0x2a2a2a, { y: 0.26, z: 0.2, rx: Math.PI / 2 }), P(box(0.1, 0.02, 0.14), cap, { y: 0.17, z: -0.18, rx: 0.3 }),
        ...eyes(0.05, 0.29, 0.16, 0.014),
        // ailes repliées le long du corps (c.fold : les ailes ne sont dessinées à part qu'en vol)
        ...(c.fold ? [P(sph(0.07, 6, 4), back, { x: 0.085, y: 0.18, z: -0.04, sx: 0.5, sy: 0.8, sz: 2.0, rx: 0.15 }), P(sph(0.07, 6, 4), back, { x: -0.085, y: 0.18, z: -0.04, sx: 0.5, sy: 0.8, sz: 2.0, rx: 0.15 }),
          P(box(0.06, 0.03, 0.08), c.tip || 0x1a1a1a, { x: 0.07, y: 0.19, z: -0.18 }), P(box(0.06, 0.03, 0.08), c.tip || 0x1a1a1a, { x: -0.07, y: 0.19, z: -0.18 }),
          P(cyl(0.008, 0.008, 0.08, 3), c.beak || 0x2a2a2a, { x: 0.03, y: 0.04 }), P(cyl(0.008, 0.008, 0.08, 3), c.beak || 0x2a2a2a, { x: -0.03, y: 0.04 })] : [])]),
      flap: featherWing(0.22, 0.13, back, c.tip || cap), pivots: [0.08, 0.18, 0.0], h: 0.35, r: 0.15, skin: 'feather',
    };
  },
  owl(c) {
    const f = c.fur || 0xf2f0ea, fleck = c.fleck || 0x5a5048;
    const fl = []; for (let i = 0; i < 9; i++) fl.push(P(sph(0.035, 5, 3), fleck, { x: Math.sin(i * 2.4) * 0.22, y: 0.3 + (i % 3) * 0.12, z: Math.cos(i * 2.4) * 0.22 - 0.02, sy: 0.6 }));
    return {
      body: merge([P(sph(0.3), f, { y: 0.38, sy: 1.25, sz: 0.95 }), P(sph(0.24), f, { y: 0.82 }), ...fl,
        P(sph(0.08), 0xffd23a, { x: 0.1, y: 0.85, z: 0.18, sz: 0.4, rig: [FACE.RIG.EYE, 0.1, 0.85, 0.18] }), P(sph(0.08), 0xffd23a, { x: -0.1, y: 0.85, z: 0.18, sz: 0.4, rig: [FACE.RIG.EYE, -0.1, 0.85, 0.18] }),
        P(sph(0.04), 0x111111, { x: 0.1, y: 0.85, z: 0.21, rig: [FACE.RIG.EYE, 0.1, 0.85, 0.21] }), P(sph(0.04), 0x111111, { x: -0.1, y: 0.85, z: 0.21, rig: [FACE.RIG.EYE, -0.1, 0.85, 0.21] }),
        P(cone(0.035, 0.1, 4), 0x3a3030, { y: 0.77, z: 0.24, rx: Math.PI * 0.6 }),
        P(cone(0.05, 0.14, 4), f, { x: 0.14, y: 1.04, z: 0.02, rz: -0.3 }), P(cone(0.05, 0.14, 4), f, { x: -0.14, y: 1.04, z: 0.02, rz: 0.3 }),
        P(sph(0.05), 0x5a4a3a, { x: 0.1, y: 0.02, z: 0.08, sz: 1.5 }), P(sph(0.05), 0x5a4a3a, { x: -0.1, y: 0.02, z: 0.08, sz: 1.5 })]),
      flap: wingGeo(0.5, 0.3, f), pivots: [0.24, 0.55, -0.02], h: 1.15, r: 0.35,
    };
  },
  penguin(c) {
    const black = c.back || 0x23262e, white = 0xf6f6f2, orange = 0xf0962a;
    const extra = [];
    if (c.scarf) extra.push(P(tor(0.27, 0.07, 6, 14), c.scarf, { y: 0.92, rx: Math.PI / 2 }));
    if (c.bonnet) extra.push(P(sph(0.29, 10, 6, 0, TAU, 0, Math.PI / 2), c.bonnet, { y: 1.2 }), P(sph(0.09), 0xffffff, { y: 1.5 }));
    return {
      body: merge([P(sph(0.42, 10, 8), black, { y: 0.6, sy: 1.35, sz: 0.9 }), P(sph(0.36, 10, 8), white, { y: 0.56, z: 0.14, sx: 0.95, sy: 1.25, sz: 0.7 }),
        P(sph(0.28), black, { y: 1.15 }), P(sph(0.22), white, { y: 1.12, z: 0.12, sy: 0.85, sz: 0.6 }), P(cone(0.07, 0.22, 6), orange, { y: 1.11, z: 0.32, rx: Math.PI / 2 }),
        ...eyes(0.1, 1.2, 0.24, 0.045), P(sph(0.1), orange, { x: 0.15, y: 0.03, z: 0.08, sy: 0.4, sz: 1.6 }), P(sph(0.1), orange, { x: -0.15, y: 0.03, z: 0.08, sy: 0.4, sz: 1.6 }), ...extra]),
      flap: merge([P(sph(0.16), black, { x: 0.02, y: -0.22, sx: 0.35, sy: 1.6, sz: 0.8 })]), pivots: [0.4, 0.82, 0], flapAxis: 'z', h: 1.45, r: 0.45,
    };
  },
  marmot(c) {
    const f = c.fur || 0xa07048, belly = c.belly || 0xe8d0a8;
    return {
      body: merge([P(sph(0.26), f, { y: 0.32, sy: 1.35, sz: 1.0 }), P(sph(0.2), belly, { y: 0.32, z: 0.1, sy: 1.3, sz: 0.8 }), P(sph(0.17), f, { y: 0.72 }),
        P(sph(0.09), belly, { y: 0.68, z: 0.13, sz: 0.8 }), P(sph(0.03), 0x241a14, { y: 0.71, z: 0.22 }), P(box(0.05, 0.05, 0.02), 0xffffff, { y: 0.62, z: 0.2 }),
        P(sph(0.05), f, { x: 0.12, y: 0.86, sy: 0.7, rig: [FACE.RIG.EAR_R, 0.1, 0.82, 0] }), P(sph(0.05), f, { x: -0.12, y: 0.86, sy: 0.7, rig: [FACE.RIG.EAR_L, -0.1, 0.82, 0] }), ...eyes(0.07, 0.77, 0.14, 0.025),
        P(sph(0.05), f, { x: 0.13, y: 0.45, z: 0.17, sy: 1.4 }), P(sph(0.05), f, { x: -0.13, y: 0.45, z: 0.17, sy: 1.4 })]),
      h: 0.95, r: 0.3,
    };
  },
  reindeer(c) {
    const f = c.fur || 0x8a5a3a, light = 0xf2e8d8, ant = 0xd8c4a0, leg = 0x5a3a24;
    const parts = [P(sph(0.5, 10, 8), f, { y: 1.15, sx: 0.8, sy: 0.82, sz: 1.55 }), P(sph(0.3), light, { y: 1.18, z: 0.55, sx: 1.05, sy: 1.1 }),
      P(cyl(0.16, 0.22, 0.7, 7), f, { y: 1.6, z: 0.7, rx: 0.5 }), P(sph(0.24), f, { y: 1.92, z: 0.95, sz: 1.3 }), P(sph(0.13), light, { y: 1.86, z: 1.2, sz: 1.2 }),
      P(sph(0.07), c.nose || 0x2a1a14, { y: 1.88, z: 1.33 }), ...eyes(0.13, 2.0, 1.06, 0.035), P(sph(0.1), 0xffffff, { y: 1.3, z: -0.75, rig: [FACE.RIG.TAIL, 0, 1.35, -0.68] })];
    for (const [x, z] of [[0.24, 0.5], [-0.24, 0.5], [0.24, -0.5], [-0.24, -0.5]]) parts.push(P(cyl(0.07, 0.06, 0.95, 5), leg, { x, y: 0.5, z }), P(sph(0.08), 0x2a1a14, { x, y: 0.04, z: z + 0.03 }));
    for (const s of [-1, 1]) {
      parts.push(P(cyl(0.035, 0.05, 0.6, 4), ant, { x: s * 0.16, y: 2.35, z: 0.85, rz: -s * 0.4, rx: -0.3 }));
      parts.push(P(cyl(0.03, 0.035, 0.35, 4), ant, { x: s * 0.36, y: 2.55, z: 0.75, rz: -s * 1.1 }));
      parts.push(P(cyl(0.03, 0.035, 0.3, 4), ant, { x: s * 0.24, y: 2.55, z: 0.95, rx: 0.8 }));
      parts.push(P(sph(0.09), f, { x: s * 0.2, y: 2.08, z: 0.82, sx: 1.6, sy: 0.6, rig: [s > 0 ? FACE.RIG.EAR_R : FACE.RIG.EAR_L, s * 0.08, 2.1, 0.85] }));
    }
    return { body: merge(parts), h: 2.6, r: 0.8 };
  },
  ermine(c) {
    const f = c.fur || 0xfafbff;
    return {
      body: merge([P(sph(0.1), f, { y: 0.15, sz: 3.0 }), P(sph(0.09), f, { y: 0.24, z: 0.32 }), P(sph(0.03), 0x111111, { y: 0.24, z: 0.41 }),
        ...eyes(0.045, 0.28, 0.38, 0.018), P(sph(0.035), f, { x: 0.06, y: 0.33, z: 0.3 }), P(sph(0.035), f, { x: -0.06, y: 0.33, z: 0.3 }),
        P(sph(0.045), f, { y: 0.2, z: -0.38, sz: 2.4, rx: -0.4, rig: [FACE.RIG.TAIL, 0, 0.17, -0.28] }), P(sph(0.05), 0x141414, { y: 0.28, z: -0.52, rig: [FACE.RIG.TAIL, 0, 0.17, -0.28] })]),
      h: 0.45, r: 0.3,
    };
  },
  squirrel(c) {
    const f = c.fur || 0xc0602a, belly = 0xf2dcc0;
    return {
      body: merge([P(sph(0.14), f, { y: 0.2, sy: 1.25 }), P(sph(0.1), belly, { y: 0.2, z: 0.07, sy: 1.2, sz: 0.8 }), P(sph(0.1), f, { y: 0.42, z: 0.05 }),
        P(cone(0.035, 0.1, 4), f, { x: 0.06, y: 0.54, z: 0.03, rig: [FACE.RIG.EAR_R, 0.06, 0.5, 0.03] }), P(cone(0.035, 0.1, 4), f, { x: -0.06, y: 0.54, z: 0.03, rig: [FACE.RIG.EAR_L, -0.06, 0.5, 0.03] }), ...eyes(0.05, 0.45, 0.13, 0.02),
        P(sph(0.13), f, { y: 0.36, z: -0.2, sy: 2.1, sz: 0.9, rx: -0.25, rig: [FACE.RIG.TAIL, 0, 0.14, -0.1] }), P(sph(0.1), f, { y: 0.66, z: -0.12, sz: 1.3, rig: [FACE.RIG.TAIL, 0, 0.14, -0.1] })]),
      h: 0.7, r: 0.2,
    };
  },
  fox(c) {
    const red = c.fur || 0xd8641e, white = 0xfaf2e6, dark = 0x2a1a14;
    const parts = [P(sph(0.26), red, { y: 0.55, sz: 1.9, sy: 0.9 }), P(sph(0.2), white, { y: 0.5, z: 0.32, sy: 1.0, sz: 0.8 }), P(sph(0.22), red, { y: 0.86, z: 0.5 }),
      P(cone(0.11, 0.32, 6), white, { y: 0.81, z: 0.75, rx: Math.PI / 2 }), P(sph(0.04), dark, { y: 0.81, z: 0.92 }), ...eyes(0.09, 0.91, 0.67, 0.035),
      P(cone(0.08, 0.22, 4), dark, { x: 0.12, y: 1.08, z: 0.48, rz: -0.25, rig: [FACE.RIG.EAR_R, 0.1, 0.98, 0.48] }), P(cone(0.08, 0.22, 4), dark, { x: -0.12, y: 1.08, z: 0.48, rz: 0.25, rig: [FACE.RIG.EAR_L, -0.1, 0.98, 0.48] }),
      P(sph(0.18), red, { y: 0.66, z: -0.72, sz: 2.6, rx: -0.3, rig: [FACE.RIG.TAIL, 0, 0.6, -0.36] }), P(sph(0.12), white, { y: 0.8, z: -1.12, rig: [FACE.RIG.TAIL, 0, 0.6, -0.36] })];
    for (const [x, z] of [[0.13, 0.3], [-0.13, 0.3], [0.13, -0.3], [-0.13, -0.3]]) parts.push(P(cyl(0.05, 0.05, 0.42, 5), dark, { x, y: 0.21, z }));
    if (c.scarf) parts.push(P(tor(0.2, 0.06, 6, 12), c.scarf, { y: 0.72, z: 0.45, rx: Math.PI / 2 + 0.5 }), P(box(0.1, 0.35, 0.04), c.scarf, { x: 0.1, y: 0.55, z: 0.25, rz: 0.4 }));
    return { body: merge(parts), h: 1.1, r: 0.45 };
  },
  fish(c) {
    const f = c.fur || 0xff8a3a;
    return { body: merge([P(sph(0.13), f, { sx: 0.5, sz: 2.2 }), P(cone(0.12, 0.18, 4), f, { z: -0.32, rx: -Math.PI / 2, sx: 0.3 }), ...eyes(0.05, 0.03, 0.18, 0.02)]), h: 0.3, r: 0.2, skin: 'skin' };
  },
  sprite(c) { return { body: merge([P(new THREE.IcosahedronGeometry(0.12, 0), c.fur || 0xbfeaff)]), h: 0.3, r: 0.2, unlit: true }; },
  /** Chat à quatre pattes (pelage teinté par bête) ; casque de garde, collier, foulard en option. */
  cat(c) {
    const f = 0xffffff, light = 0xfff8f0, pink = 0xf2a0b0, dark = 0x1a1414;
    const parts = [P(sph(0.24, 10, 8), f, { y: 0.4, sz: 1.55, sy: 0.82 }), P(sph(0.17), light, { y: 0.4, z: 0.22, sy: 1.0, sz: 0.9 }),
      P(sph(0.21, 10, 8), f, { y: 0.7, z: 0.4, sx: 1.08, sy: 0.95 }), P(sph(0.09), light, { y: 0.63, z: 0.56, sx: 1.4, sy: 0.75 }),
      P(sph(0.028), pink, { y: 0.67, z: 0.64 }), ...eyes(0.085, 0.74, 0.56, 0.032), P(sph(0.012), 0xffffff, { x: 0.075, y: 0.755, z: 0.585, rig: [FACE.RIG.EYE, 0.085, 0.74, 0.56] }), P(sph(0.012), 0xffffff, { x: -0.095, y: 0.755, z: 0.585, rig: [FACE.RIG.EYE, -0.085, 0.74, 0.56] }),
      P(cone(0.085, 0.17, 4), f, { x: 0.12, y: 0.9, z: 0.36, rz: -0.32, rig: [FACE.RIG.EAR_R, 0.1, 0.83, 0.36] }), P(cone(0.085, 0.17, 4), f, { x: -0.12, y: 0.9, z: 0.36, rz: 0.32, rig: [FACE.RIG.EAR_L, -0.1, 0.83, 0.36] }),
      P(cone(0.05, 0.1, 4), pink, { x: 0.115, y: 0.89, z: 0.39, rz: -0.32, rig: [FACE.RIG.EAR_R, 0.1, 0.83, 0.36] }), P(cone(0.05, 0.1, 4), pink, { x: -0.115, y: 0.89, z: 0.39, rz: 0.32, rig: [FACE.RIG.EAR_L, -0.1, 0.83, 0.36] }),
      P(cyl(0.045, 0.03, 0.62, 5), f, { y: 0.66, z: -0.47, rx: -0.55, rig: [FACE.RIG.TAIL, 0, 0.42, -0.3] }), P(sph(0.045), light, { y: 0.92, z: -0.62, rig: [FACE.RIG.TAIL, 0, 0.42, -0.3] })];
    for (const s of [-1, 1]) for (const k of [-1, 1]) parts.push(P(box(0.18, 0.006, 0.006), 0xf4f4f4, { x: s * 0.13, y: 0.64 + k * 0.02, z: 0.6, rz: s * k * 0.15 }));
    for (const [x, z] of [[0.1, 0.24], [-0.1, 0.24], [0.1, -0.22], [-0.1, -0.22]]) parts.push(P(cyl(0.05, 0.045, 0.3, 5), f, { x, y: 0.15, z }), P(sph(0.055), light, { x, y: 0.03, z: z + 0.02, sz: 1.3, sy: 0.6 }));
    if (c.collar) parts.push(P(tor(0.15, 0.035, 5, 12), c.collar, { y: 0.56, z: 0.37, rx: Math.PI / 2 - 0.5 }), P(sph(0.04), 0xffd23a, { y: 0.47, z: 0.48 }));
    if (c.helmet) parts.push(P(sph(0.2, 10, 6, 0, TAU, 0, Math.PI / 2), c.helmet, { y: 0.78, z: 0.4, sy: 0.8 }), P(box(0.04, 0.12, 0.3), c.plume || 0xd83a3a, { y: 0.98, z: 0.36 }));
    return { body: merge(parts), h: 1.0, r: 0.35, tint: true };
  },
  mouse(c) {
    const f = c.fur || 0xb8b0b8, pink = 0xf4a8b8;
    return {
      body: merge([P(sph(0.11, 8, 6), f, { y: 0.1, sz: 1.45, sy: 0.85 }), P(sph(0.075), f, { y: 0.14, z: 0.15, sz: 1.2 }), P(sph(0.02), pink, { y: 0.14, z: 0.25 }),
        ...eyes(0.04, 0.17, 0.2, 0.016), P(sph(0.05), f, { x: 0.06, y: 0.23, z: 0.11, sz: 0.35, rig: [FACE.RIG.EAR_R, 0.05, 0.19, 0.11] }), P(sph(0.04), pink, { x: 0.06, y: 0.23, z: 0.125, sz: 0.25, rig: [FACE.RIG.EAR_R, 0.05, 0.19, 0.11] }),
        P(sph(0.05), f, { x: -0.06, y: 0.23, z: 0.11, sz: 0.35, rig: [FACE.RIG.EAR_L, -0.05, 0.19, 0.11] }), P(sph(0.04), pink, { x: -0.06, y: 0.23, z: 0.125, sz: 0.25, rig: [FACE.RIG.EAR_L, -0.05, 0.19, 0.11] }),
        P(cyl(0.012, 0.006, 0.34, 4), pink, { y: 0.1, z: -0.3, rx: 1.25, rig: [FACE.RIG.TAIL, 0, 0.1, -0.14] }), P(cyl(0.008, 0.005, 0.18, 4), pink, { y: 0.2, z: -0.47, rx: 0.4, rig: [FACE.RIG.TAIL, 0, 0.1, -0.14] })]),
      h: 0.3, r: 0.14,
    };
  },
  bat(c) {
    const f = c.fur || 0x5a4a6a, belly = 0x8a7a8a;
    return {
      body: merge([P(sph(0.12), f, { y: 0.14, sy: 1.1 }), P(sph(0.08), belly, { y: 0.13, z: 0.06, sy: 1.1, sz: 0.6 }), P(sph(0.09), f, { y: 0.3, z: 0.02 }),
        P(cone(0.04, 0.12, 4), f, { x: 0.06, y: 0.42, z: 0.0, rz: -0.25 }), P(cone(0.04, 0.12, 4), f, { x: -0.06, y: 0.42, z: 0.0, rz: 0.25 }),
        P(sph(0.026), 0xffffff, { x: 0.035, y: 0.32, z: 0.085 }), P(sph(0.026), 0xffffff, { x: -0.035, y: 0.32, z: 0.085 }),
        P(sph(0.014), 0x141414, { x: 0.035, y: 0.32, z: 0.105, rig: [FACE.RIG.EYE, 0.035, 0.32, 0.105] }), P(sph(0.014), 0x141414, { x: -0.035, y: 0.32, z: 0.105, rig: [FACE.RIG.EYE, -0.035, 0.32, 0.105] }), P(cone(0.008, 0.025, 3), 0xffffff, { x: 0.015, y: 0.26, z: 0.09, rx: Math.PI })]),
      flap: merge([P(sph(0.5, 8, 4), c.wing || 0x3a2a48, { x: 0.17, sx: 0.34, sy: 0.04, sz: 0.2 }), P(sph(0.5, 8, 4), c.wing || 0x3a2a48, { x: 0.27, z: -0.06, sx: 0.2, sy: 0.04, sz: 0.16 })]), pivots: [0.08, 0.2, 0], h: 0.45, r: 0.15,
    };
  },
  puppy(c) {
    const f = 0xffffff, dark = 0x1a1414;
    const parts = [P(sph(0.22), f, { y: 0.32, sz: 1.4, sy: 0.9 }), P(sph(0.19), f, { y: 0.56, z: 0.28 }), P(sph(0.09), 0xffffff, { y: 0.51, z: 0.44, sz: 0.9 }),
      P(sph(0.035), dark, { y: 0.55, z: 0.52 }), ...eyes(0.08, 0.61, 0.43, 0.03), P(sph(0.07), f, { x: 0.16, y: 0.55, z: 0.22, sy: 1.8, rig: [FACE.RIG.EAR_R, 0.15, 0.66, 0.22] }), P(sph(0.07), f, { x: -0.16, y: 0.55, z: 0.22, sy: 1.8, rig: [FACE.RIG.EAR_L, -0.15, 0.66, 0.22] }),
      P(sph(0.05), f, { y: 0.45, z: -0.32, sz: 1.8, rx: 0.8, rig: [FACE.RIG.TAIL, 0, 0.4, -0.24] })];
    for (const [x, z] of [[0.1, 0.18], [-0.1, 0.18], [0.1, -0.18], [-0.1, -0.18]]) parts.push(P(cyl(0.05, 0.05, 0.22, 5), f, { x, y: 0.11, z }));
    if (c.bonnet) parts.push(P(sph(0.17, 8, 5, 0, TAU, 0, Math.PI / 2), c.bonnet, { y: 0.68, z: 0.26 }), P(sph(0.06), 0xfff0f0, { y: 0.86, z: 0.26 }));
    if (c.collar) parts.push(P(tor(0.16, 0.035, 5, 12), c.collar, { y: 0.47, z: 0.2, rx: Math.PI / 2 + 0.5 }));
    return { body: merge(parts), h: 0.9, r: 0.3, tint: true };
  },
  // --- la ferme (niveau 7) : poules, poussins, chèvres, âne, porcelets, abeille (canards, grenouilles, papillons : lifekit.js ; moineaux : bird ; chat, souris : ceux du château)
  // « skin » : la matière (skinMaterial) posée sur le modèle quand le monde le demande (cfg.real) : pelage, plumes, peau
  hen(c) {
    const f = c.fur || 0xffffff, red = 0xd8302a, y = 0xe8a830;
    const parts = [P(sph(0.27, 12, 9), f, { y: 0.44, sz: 1.25, sy: 0.92 }), P(sph(0.17, 10, 8), f, { y: 0.74, z: 0.24 }),
      P(sph(0.2, 8, 6), f, { y: 0.62, z: -0.3, sx: 0.55, sy: 1.3, rx: -0.6 }),
      P(sph(0.12, 8, 6), f, { x: 0.22, y: 0.46, z: -0.02, sx: 0.4, sy: 0.8, sz: 1.6 }), P(sph(0.12, 8, 6), f, { x: -0.22, y: 0.46, z: -0.02, sx: 0.4, sy: 0.8, sz: 1.6 }),
      P(sph(0.05, 6, 4), red, { y: 0.93, z: 0.25, sx: 0.5, sz: 1.6 }), P(sph(0.04, 6, 4), red, { y: 0.92, z: 0.16, sx: 0.5 }), P(sph(0.04, 6, 4), red, { y: 0.63, z: 0.36, sx: 0.6, sy: 1.5 }),
      P(cone(0.045, 0.11, 5), y, { y: 0.73, z: 0.42, rx: Math.PI / 2 }), ...eyes(0.09, 0.79, 0.34, 0.024)];
    for (const s of [-1, 1]) parts.push(P(cyl(0.022, 0.022, 0.26, 4), y, { x: s * 0.08, y: 0.13 }), P(box(0.09, 0.02, 0.13), y, { x: s * 0.08, y: 0.01, z: 0.04 }));
    return { body: merge(parts), h: 0.95, r: 0.3, tint: true, skin: 'feather' };
  },
  chick(c) {
    const f = c.fur || 0xffe060, o = 0xf09a20;
    return {
      body: merge([P(sph(0.14, 10, 8), f, { y: 0.16, sz: 1.1 }), P(sph(0.1, 10, 8), f, { y: 0.33, z: 0.07 }), P(cone(0.03, 0.06, 4), o, { y: 0.32, z: 0.18, rx: Math.PI / 2 }),
        ...eyes(0.05, 0.36, 0.14, 0.016), P(sph(0.05, 6, 4), f, { x: 0.12, y: 0.18, sx: 0.4, sz: 1.4 }), P(sph(0.05, 6, 4), f, { x: -0.12, y: 0.18, sx: 0.4, sz: 1.4 }),
        P(cyl(0.012, 0.012, 0.06, 4), o, { x: 0.05, y: 0.02 }), P(cyl(0.012, 0.012, 0.06, 4), o, { x: -0.05, y: 0.02 })]),
      h: 0.45, r: 0.15, skin: 'feather',
    };
  },
  goat(c) {
    const f = c.fur || 0xffffff, horn = 0xb8a890, hoof = 0x3a3028, pink = 0xe8b0a0;
    const parts = [P(sph(0.42, 12, 9), f, { y: 0.88, sx: 0.72, sy: 0.75, sz: 1.35 }), P(cyl(0.12, 0.17, 0.5, 8), f, { y: 1.2, z: 0.45, rx: 0.55 }),
      P(sph(0.19, 10, 8), f, { y: 1.42, z: 0.62, sz: 1.35, rx: 0.3 }), P(sph(0.1, 8, 6), pink, { y: 1.33, z: 0.84, sx: 0.9, sy: 0.7 }), P(sph(0.025), 0x2a1a14, { x: 0.035, y: 1.36, z: 0.92 }), P(sph(0.025), 0x2a1a14, { x: -0.035, y: 1.36, z: 0.92 }),
      P(cone(0.06, 0.2, 5), f, { y: 1.16, z: 0.74, rx: Math.PI }), ...eyes(0.12, 1.5, 0.7, 0.03), P(sph(0.07, 6, 4), f, { y: 1.08, z: -0.58, sy: 1.6, rx: -0.6, rig: [FACE.RIG.TAIL, 0, 1.0, -0.52] })];
    for (const s of [-1, 1]) {
      parts.push(P(cone(0.045, 0.32, 5), horn, { x: s * 0.08, y: 1.66, z: 0.5, rx: -0.9, rz: -s * 0.15 }));
      parts.push(P(sph(0.06, 6, 4), f, { x: s * 0.2, y: 1.48, z: 0.55, sx: 2.2, sy: 0.5, rz: s * 0.3, rig: [s > 0 ? FACE.RIG.EAR_R : FACE.RIG.EAR_L, s * 0.1, 1.5, 0.55] }));
    }
    for (const [x, z] of [[0.18, 0.4], [-0.18, 0.4], [0.18, -0.38], [-0.18, -0.38]]) parts.push(P(cyl(0.06, 0.05, 0.62, 6), f, { x, y: 0.34, z }), P(cyl(0.055, 0.06, 0.08, 6), hoof, { x, y: 0.04, z }));
    return { body: merge(parts), h: 1.8, r: 0.55, tint: true, skin: 'fur' };
  },
  donkey(c) {
    const f = c.fur || 0x9a948c, light = 0xe8e2d8, dark = 0x3a3430;
    const parts = [P(sph(0.5, 12, 9), f, { y: 1.2, sx: 0.75, sy: 0.78, sz: 1.5 }), P(sph(0.36, 10, 8), light, { y: 1.02, sx: 0.85, sy: 0.6, sz: 1.3 }),
      P(cyl(0.18, 0.26, 0.75, 8), f, { y: 1.62, z: 0.66, rx: 0.6 }), P(sph(0.26, 10, 8), f, { y: 1.95, z: 0.92, sz: 1.5, rx: 0.4 }), P(sph(0.18, 10, 8), light, { y: 1.82, z: 1.22, sz: 1.1 }),
      P(sph(0.03), dark, { x: 0.07, y: 1.84, z: 1.38 }), P(sph(0.03), dark, { x: -0.07, y: 1.84, z: 1.38 }), ...eyes(0.15, 2.05, 1.0, 0.04),
      P(box(0.06, 0.18, 0.7), dark, { y: 1.95, z: 0.6, rx: 0.6 }), P(cyl(0.035, 0.02, 0.6, 5), f, { y: 1.05, z: -0.85, rx: 0.35, rig: [FACE.RIG.TAIL, 0, 1.32, -0.76] }), P(sph(0.07, 6, 4), dark, { y: 0.78, z: -0.95, sy: 1.6, rig: [FACE.RIG.TAIL, 0, 1.32, -0.76] })];
    for (const s of [-1, 1]) parts.push(P(sph(0.08, 8, 6), f, { x: s * 0.16, y: 2.35, z: 0.78, sy: 3.2, sx: 0.9, rz: -s * 0.25, rx: -0.3, rig: [s > 0 ? FACE.RIG.EAR_R : FACE.RIG.EAR_L, s * 0.12, 2.12, 0.82] }), P(sph(0.05, 6, 4), dark, { x: s * 0.2, y: 2.58, z: 0.72, sy: 1.5, rig: [s > 0 ? FACE.RIG.EAR_R : FACE.RIG.EAR_L, s * 0.12, 2.12, 0.82] }));
    for (const [x, z] of [[0.22, 0.5], [-0.22, 0.5], [0.22, -0.52], [-0.22, -0.52]]) parts.push(P(cyl(0.08, 0.07, 0.9, 6), f, { x, y: 0.48, z }), P(cyl(0.08, 0.085, 0.1, 6), dark, { x, y: 0.05, z }));
    return { body: merge(parts), h: 2.7, r: 0.8, skin: 'fur' };
  },
  piglet(c) {
    const f = c.fur || 0xf4b0a8, dark = 0x5a2a28, mud = c.mud || 0x7a5232;
    const parts = [P(sph(0.3, 12, 9), f, { y: 0.36, sz: 1.35, sy: 0.92 }), P(sph(0.21, 10, 8), f, { y: 0.44, z: 0.36 }), P(cyl(0.09, 0.1, 0.1, 10), 0xf09a98, { y: 0.4, z: 0.57, rx: Math.PI / 2 }),
      P(sph(0.02), dark, { x: 0.035, y: 0.41, z: 0.63 }), P(sph(0.02), dark, { x: -0.035, y: 0.41, z: 0.63 }), ...eyes(0.09, 0.52, 0.5, 0.026),
      P(cone(0.08, 0.14, 4), f, { x: 0.12, y: 0.64, z: 0.3, rz: -0.4, rx: 0.4, rig: [FACE.RIG.EAR_R, 0.1, 0.58, 0.32] }), P(cone(0.08, 0.14, 4), f, { x: -0.12, y: 0.64, z: 0.3, rz: 0.4, rx: 0.4, rig: [FACE.RIG.EAR_L, -0.1, 0.58, 0.32] }),
      P(tor(0.05, 0.015, 4, 8), f, { y: 0.44, z: -0.42, ry: Math.PI / 2, rig: [FACE.RIG.TAIL, 0, 0.44, -0.38] }), P(sph(0.17, 8, 6), mud, { x: 0.12, y: 0.22, z: -0.1, sx: 1.3, sy: 0.6, sz: 1.6 })];
    for (const [x, z] of [[0.14, 0.22], [-0.14, 0.22], [0.14, -0.22], [-0.14, -0.22]]) parts.push(P(cyl(0.055, 0.05, 0.2, 6), f, { x, y: 0.1, z }));
    return { body: merge(parts), h: 0.75, r: 0.35, skin: 'skin' };
  },
  bee() {
    const y = 0xf2c020, k = 0x2a2420;
    return {
      body: merge([P(sph(0.08, 8, 6), y, { sz: 1.35 }), P(cyl(0.079, 0.079, 0.03, 8), k, { z: -0.02, rx: Math.PI / 2 }), P(cyl(0.07, 0.07, 0.03, 8), k, { z: -0.07, rx: Math.PI / 2 }),
        P(sph(0.05, 6, 4), k, { z: 0.1 }), ...eyes(0.03, 0.02, 0.13, 0.012)]),
      flap: wingGeo(0.12, 0.07, 0xf4f8ff), pivots: [0.02, 0.06, 0], h: 0.2, r: 0.1, skin: 'skin',
    };
  },
  // --- bord de mer ---
  /** Crabe : carapace, yeux sur pédoncules, six pattes ; les pinces (flap) claquent. */
  crab(c) {
    const red = c.fur || 0xd8502a, dark = c.dark || 0xa83a1a, belly = c.belly || 0xf0a070;
    const parts = [P(sph(0.3, 10, 6), red, { y: 0.24, sx: 1.25, sy: 0.5, sz: 0.95 }), P(sph(0.27, 10, 5), belly, { y: 0.19, sx: 1.2, sy: 0.3, sz: 0.85 })];
    for (const s of [-1, 1]) {
      parts.push(P(cyl(0.022, 0.022, 0.2, 4), dark, { x: s * 0.1, y: 0.4, z: 0.15 }), P(sph(0.055, 6, 5), 0xffffff, { x: s * 0.1, y: 0.52, z: 0.16, rig: [FACE.RIG.EYE, s * 0.1, 0.52, 0.16] }), P(sph(0.03, 5, 4), 0x111111, { x: s * 0.1, y: 0.53, z: 0.2, rig: [FACE.RIG.EYE, s * 0.1, 0.52, 0.16] }));
      for (let i = 0; i < 3; i++) parts.push(P(cyl(0.024, 0.016, 0.34, 4), dark, { x: s * 0.4, y: 0.13, z: 0.12 - i * 0.14, rz: s * 1.05 }));
    }
    const flap = merge([P(cyl(0.035, 0.035, 0.22, 5), red, { x: 0.05, z: 0.1, rx: Math.PI / 2 }), P(sph(0.1, 7, 5), red, { x: 0.06, y: 0.03, z: 0.25, sx: 0.8, sy: 0.7, sz: 1.2 }),
      P(cone(0.04, 0.12, 4), dark, { x: 0.02, y: 0.06, z: 0.36, rx: Math.PI / 2 })]);
    return { body: merge(parts), flap, pivots: [0.28, 0.26, 0.2], flapAxis: 'z', h: 0.6, r: 0.4 };
  },
  /** Bernard-l'ermite : une grosse coquille en spirale, une petite tête rouge et ses pattes. */
  hermit(c) {
    const shell = c.shell || 0xe8d0b0, band = c.band || 0xc89870, body = c.fur || 0xe0603a;
    const parts = [];
    for (let i = 0; i < 4; i++) parts.push(P(sph(0.26 - i * 0.05, 9, 6), i % 2 ? band : shell, { y: 0.3 + i * 0.1, z: -0.06 - i * 0.04, sz: 1.2 }));
    parts.push(P(cone(0.08, 0.2, 6), shell, { y: 0.72, z: -0.2, rx: -0.5 }), P(cyl(0.2, 0.2, 0.04, 10), 0x3a2418, { y: 0.27, z: 0.16, rx: 1.2 }));
    parts.push(P(sph(0.1, 7, 5), body, { y: 0.2, z: 0.22 }), P(sph(0.05, 6, 4), body, { x: 0.12, y: 0.18, z: 0.3, sz: 1.4 }), P(sph(0.07, 6, 4), body, { x: -0.13, y: 0.18, z: 0.3, sz: 1.5 }));
    for (const s of [-1, 1]) {
      parts.push(P(cyl(0.015, 0.015, 0.16, 4), body, { x: s * 0.05, y: 0.32, z: 0.27 }), P(sph(0.035, 6, 4), 0x111111, { x: s * 0.05, y: 0.41, z: 0.28, rig: [FACE.RIG.EYE, s * 0.05, 0.41, 0.28] }));
      for (let i = 0; i < 2; i++) parts.push(P(cyl(0.02, 0.014, 0.24, 4), body, { x: s * 0.17, y: 0.08, z: 0.18 - i * 0.1, rz: s * 1.0 }));
    }
    return { body: merge(parts), h: 0.6, r: 0.3 };
  },
  /** Dauphin (origine au milieu du corps : il nage à la surface, saute en arc). */
  dolphin(c) {
    const back = c.back || 0x5a7488, belly = c.belly || 0xdce6ee;
    const parts = [P(sph(0.42, 12, 8), back, { sx: 0.72, sy: 0.7, sz: 2.4 }), P(sph(0.36, 10, 6), belly, { y: -0.1, sx: 0.66, sy: 0.55, sz: 2.2 }),
      P(cone(0.13, 0.42, 8), back, { y: -0.05, z: 1.12, rx: Math.PI / 2, sy: 1 }), P(sph(0.18, 8, 6), back, { y: 0.12, z: 0.78, sx: 0.9 }),
      P(cone(0.22, 0.48, 5), back, { y: 0.42, z: -0.05, rx: -0.55, sz: 0.25 }), P(cone(0.1, 0.5, 6), back, { z: -1.05, rx: -Math.PI / 2 }),
      P(box(0.9, 0.05, 0.3), back, { z: -1.32 }), ...eyes(0.17, 0.14, 0.78, 0.03), P(box(0.18, 0.012, 0.012), 0x2a3440, { y: -0.04, z: 1.12 })];
    const flap = merge([P(sph(0.16, 6, 4), back, { x: 0.14, sx: 1.6, sy: 0.15, sz: 0.6, ry: -0.5 })]);
    return { body: merge(parts), flap, pivots: [0.24, -0.15, 0.45], h: 0.9, r: 1.0 };
  },
  /** Méduse : une ombrelle rose et des tentacules (on la voit par transparence : lueur). */
  jelly(c) {
    const f = c.fur || 0xf4a8d0, inner = c.inner || 0xffd8ec;
    const parts = [P(sph(0.42, 12, 6, 0, TAU, 0, Math.PI / 2), f, { sy: 0.75 }), P(sph(0.26, 10, 5, 0, TAU, 0, Math.PI / 2), inner, { y: 0.02, sy: 0.7 }),
      P(tor(0.4, 0.04, 4, 18), f, { y: 0.01, rx: Math.PI / 2 })];
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; parts.push(P(cyl(0.02, 0.008, 0.9, 3), inner, { x: Math.cos(a) * 0.22, y: -0.45, z: Math.sin(a) * 0.22, rx: Math.sin(a) * 0.15, rz: Math.cos(a) * 0.15 })); }
    parts.push(P(cyl(0.08, 0.02, 0.6, 5), inner, { y: -0.3 }));
    return { body: merge(parts), h: 0.4, r: 0.45 };
  },
  /** Étoile de mer (teintée) : cinq bras bombés, deux petits yeux. */
  starfish() {
    const f = 0xffffff, parts = [P(sph(0.14, 8, 5), f, { y: 0.04, sy: 0.4 })];
    for (let i = 0; i < 5; i++) {
      const a = i / 5 * TAU;
      parts.push(P(cone(0.11, 0.42, 5), f, { x: Math.sin(a) * 0.2, y: 0.04, z: Math.cos(a) * 0.2, rx: Math.PI / 2, ry: a, sx: 1, sz: 0.45 }));
      for (let k = 1; k < 3; k++) parts.push(P(sph(0.022, 4, 3), 0xfff4e0, { x: Math.sin(a) * (0.12 + k * 0.1), y: 0.075, z: Math.cos(a) * (0.12 + k * 0.1) }));
    }
    parts.push(...eyes(0.04, 0.085, 0.05, 0.022));
    return { body: merge(parts), h: 0.12, r: 0.4, tint: true };
  },
  /** Tortue de mer : carapace à écailles, tête, nageoires (flap : les nageoires avant rament). */
  turtle(c) {
    const shell = c.shell || 0x6a7a3a, scute = c.scute || 0x8a8a4a, skin = c.fur || 0x9aa878, under = 0xe8dca8;
    const parts = [P(sph(0.45, 12, 6, 0, TAU, 0, Math.PI / 2), shell, { y: 0.1, sy: 0.55, sz: 1.2 }), P(cyl(0.44, 0.4, 0.08, 12), under, { y: 0.1, sz: 1.2 })];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; parts.push(P(cyl(0.11, 0.11, 0.03, 6), scute, { x: Math.sin(a) * 0.24, y: 0.3 - 0.02, z: Math.cos(a) * 0.28, rx: Math.cos(a) * 0.5, rz: -Math.sin(a) * 0.5 })); }
    parts.push(P(cyl(0.12, 0.12, 0.03, 6), scute, { y: 0.35 }));
    parts.push(P(sph(0.15, 8, 6), skin, { y: 0.17, z: 0.62, sz: 1.2 }), ...eyes(0.08, 0.22, 0.72, 0.028), P(sph(0.08, 5, 4), skin, { x: 0.18, y: 0.08, z: -0.5, sx: 1.4, sy: 0.4 }), P(sph(0.08, 5, 4), skin, { x: -0.18, y: 0.08, z: -0.5, sx: 1.4, sy: 0.4 }));
    const flap = merge([P(sph(0.16, 6, 4), skin, { x: 0.2, sx: 1.8, sy: 0.18, sz: 0.7, ry: -0.4 })]);
    return { body: merge(parts), flap, pivots: [0.32, 0.12, 0.3], h: 0.45, r: 0.5 };
  },
  /** Phoque : corps fuselé, moustaches ; les nageoires (flap) applaudissent. */
  seal(c) {
    const f = c.fur || 0x8a8a98, belly = c.belly || 0xc0c0cc;
    const parts = [P(sph(0.36, 12, 8), f, { y: 0.3, sx: 0.95, sy: 0.8, sz: 1.7 }), P(sph(0.3, 10, 6), belly, { y: 0.22, z: 0.1, sx: 0.85, sy: 0.6, sz: 1.5 }),
      P(cone(0.16, 0.4, 8), f, { y: 0.2, z: -0.72, rx: -Math.PI / 2 }), P(sph(0.12, 6, 4), f, { x: 0.14, y: 0.12, z: -0.95, sx: 1.5, sy: 0.25, ry: 0.9 }), P(sph(0.12, 6, 4), f, { x: -0.14, y: 0.12, z: -0.95, sx: 1.5, sy: 0.25, ry: -0.9 }),
      P(sph(0.28, 10, 8), f, { y: 0.62, z: 0.52 }), P(sph(0.13, 8, 6), belly, { y: 0.54, z: 0.74, sx: 1.2, sy: 0.8 }), P(sph(0.04, 6, 4), 0x2a2a2a, { y: 0.6, z: 0.85, sx: 1.3 }),
      ...eyes(0.11, 0.69, 0.74, 0.05)];
    for (const s of [-1, 1]) for (const dy of [-0.02, 0.02]) parts.push(P(cyl(0.004, 0.004, 0.26, 3), 0xdddddd, { x: s * 0.15, y: 0.53 + dy, z: 0.82, rz: Math.PI / 2 + s * dy * 6 }));
    const flap = merge([P(sph(0.14, 6, 4), f, { x: 0.12, y: -0.05, sx: 1.6, sy: 0.25, sz: 0.8 })]);
    return { body: merge(parts), flap, pivots: [0.28, 0.16, 0.28], flapAxis: 'z', h: 0.95, r: 0.6 };
  },
};

// Habitants : chien debout (pelage teinté), habits teintés, bras animés, outils
const VILLAGER = {
  /**
   * Chien debout (pelage teinté par habitant). Le visage (yeux, sourcils, bouche, joues) est un
   * décalque à part (lifeface.js) ; la tête tourne autour du cou, les oreilles et la queue bougent.
   */
  dog() {
    const f = 0xffffff, cream = 0xfff1de, dark = 0x1a1414, tip = 0xe2d4c4, N = FACE.NECK.dog, R = FACE.RIG;
    const ear = (s) => ({ x: s * 0.27, y: 1.39, z: -0.02, sy: 2.1, sz: 0.72, rz: s * 0.3, rig: [s > 0 ? R.EAR_R : R.EAR_L, s * 0.24, 1.6, -0.02], neck: N });
    return merge([P(cyl(0.11, 0.12, 0.45, 6), f, { x: 0.16, y: 0.22 }), P(cyl(0.11, 0.12, 0.45, 6), f, { x: -0.16, y: 0.22 }),
      P(sph(0.135, 8, 6), cream, { x: 0.16, y: 0.045, z: 0.09, sz: 1.45, sy: 0.62 }), P(sph(0.135, 8, 6), cream, { x: -0.16, y: 0.045, z: 0.09, sz: 1.45, sy: 0.62 }),
      P(sph(0.36, 10, 8), f, { y: 0.78, sy: 1.25, sz: 0.9 }),
      // la tête : crâne, museau crème, truffe brillante, bajoues
      P(sph(0.3, 14, 10), f, { y: 1.46, neck: N }), P(sph(0.16, 12, 8), cream, { y: 1.38, z: 0.26, sz: 1.2, sy: 0.8, neck: N }),
      P(sph(0.09, 8, 6), cream, { x: 0.19, y: 1.33, z: 0.13, sy: 0.75, neck: N }), P(sph(0.09, 8, 6), cream, { x: -0.19, y: 1.33, z: 0.13, sy: 0.75, neck: N }),
      P(sph(0.066, 8, 6), dark, { y: 1.445, z: 0.43, sx: 1.3, sy: 0.85, neck: N }), P(sph(0.018, 5, 4), 0xffffff, { x: 0.025, y: 1.475, z: 0.48, neck: N }),
      P(sph(0.1, 8, 6), f, ear(1)), P(sph(0.1, 8, 6), f, ear(-1)),
      P(sph(0.06, 6, 5), tip, { x: 0.31, y: 1.24, z: -0.03, sy: 1.1, sz: 0.65, rz: 0.3, rig: [R.EAR_R, 0.24, 1.6, -0.02], neck: N }), P(sph(0.06, 6, 5), tip, { x: -0.31, y: 1.24, z: -0.03, sy: 1.1, sz: 0.65, rz: -0.3, rig: [R.EAR_L, -0.24, 1.6, -0.02], neck: N }),
      // la queue en panache (elle remue)
      P(sph(0.085, 8, 6), f, { y: 0.66, z: -0.4, sz: 2.1, rx: 0.85, rig: [R.TAIL, 0, 0.58, -0.3] }), P(sph(0.07, 7, 5), cream, { y: 0.84, z: -0.55, rig: [R.TAIL, 0, 0.58, -0.3] })]);
  },
  dogCloth() {
    const w = 0xffffff, N = FACE.NECK.dog;
    // (le bonnet suit la tête ; posé assez haut pour laisser voir les sourcils)
    return merge([P(cyl(0.34, 0.42, 0.55, 10), w, { y: 0.66 }), P(tor(0.25, 0.08, 6, 14), w, { y: 1.13, rx: Math.PI / 2 }), P(box(0.12, 0.34, 0.06), w, { x: 0.12, y: 0.95, z: 0.3, rz: 0.15 }),
      P(sph(0.27, 12, 6, 0, TAU, 0, Math.PI / 2), w, { y: 1.64, sy: 0.95, neck: N }), P(tor(0.25, 0.045, 6, 18), 0xe6e6e6, { y: 1.645, rx: Math.PI / 2, neck: N }), P(sph(0.1, 8, 6), w, { y: 1.97, neck: N })]);
  },
  arm() { return merge([P(sph(0.09), 0xffffff, { y: -0.22, sy: 3.0 }), P(sph(0.08), 0xf4f4f4, { y: -0.46 })]); },
  snowman() {
    const s = 0xf6f9ff;
    return merge([P(sph(0.6, 10, 8), s, { y: 0.55 }), P(sph(0.44, 10, 8), s, { y: 1.35 }), P(sph(0.32, 10, 8), s, { y: 1.96 }),
      ...eyes(0.11, 2.04, 0.27, 0.045), P(cone(0.06, 0.4, 6), 0xf07a1a, { y: 1.96, z: 0.45, rx: Math.PI / 2 }),
      P(sph(0.04), 0x1a1a1e, { y: 1.5, z: 0.42 }), P(sph(0.04), 0x1a1a1e, { y: 1.3, z: 0.44 }), P(tor(0.3, 0.07, 6, 14), 0xe0303a, { y: 1.68, rx: Math.PI / 2 })]);
  },
  snowArm() { return merge([P(cyl(0.025, 0.035, 0.75, 4), 0x5a3a24, { y: -0.36 }), P(cyl(0.02, 0.02, 0.2, 4), 0x5a3a24, { x: 0.05, y: -0.66, rz: 0.6 })]); },
  hat() { return merge([P(cyl(0.22, 0.22, 0.34, 10), 0xffffff, { y: 0.17 }), P(cyl(0.34, 0.34, 0.04, 12), 0xffffff, { y: 0.02 }), P(cyl(0.225, 0.225, 0.06, 10), 0xd04040, { y: 0.06 })]); },
  yeti() {
    const f = 0xf4f8ff, face = 0x9ab8d8;
    const parts = [P(sph(0.8, 10, 8), f, { y: 1.5, sy: 1.25, sz: 0.85 }), P(sph(0.55, 10, 8), f, { y: 2.6 }), P(sph(0.36), face, { y: 2.52, z: 0.32, sy: 0.9, sz: 0.6 }),
      ...eyes(0.13, 2.62, 0.52, 0.06), P(box(0.3, 0.08, 0.05), 0x2a3a5a, { y: 2.36, z: 0.53 }),
      P(cone(0.08, 0.3, 5), 0xd8dde8, { x: 0.32, y: 3.08, rz: -0.4 }), P(cone(0.08, 0.3, 5), 0xd8dde8, { x: -0.32, y: 3.08, rz: 0.4 }),
      P(cyl(0.22, 0.26, 0.7, 6), f, { x: 0.32, y: 0.35 }), P(cyl(0.22, 0.26, 0.7, 6), f, { x: -0.32, y: 0.35 }),
      P(sph(0.26), face, { x: 0.32, y: 0.06, z: 0.12, sz: 1.5, sy: 0.4 }), P(sph(0.26), face, { x: -0.32, y: 0.06, z: 0.12, sz: 1.5, sy: 0.4 })];
    return merge(parts);
  },
  yetiArm() { return merge([P(sph(0.2), 0xf4f8ff, { y: -0.5, sy: 3.0 }), P(sph(0.17), 0x9ab8d8, { y: -1.05 })]); },
  // outils (dans la patte droite ; origine = bout du bras)
  shovel() { return merge([P(cyl(0.03, 0.03, 1.1, 5), 0x8a5a30, { y: 0.1, rx: 0.2 }), P(box(0.36, 0.04, 0.42), 0xd84a3a, { y: -0.45, z: -0.1, rx: 0.4 })]); },
  rod() { return merge([P(cyl(0.02, 0.03, 2.0, 5), 0x6a4a2a, { y: 0.3, z: 0.7, rx: 1.0 }), P(cyl(0.004, 0.004, 1.6, 3), 0xe8e8e8, { y: 0.2, z: 1.55, rx: 0.12 }), P(sph(0.05), 0xff3a3a, { y: -0.58, z: 1.6 })]); },
  mallet() { return merge([P(cyl(0.025, 0.025, 0.6, 5), 0x8a5a30, { y: -0.1 }), P(cyl(0.09, 0.09, 0.26, 8), 0xa07048, { y: -0.4, rz: Math.PI / 2 })]); },
  pan() { return merge([P(cyl(0.025, 0.025, 0.5, 5), 0x3a3a3a, { y: -0.05, rx: 1.2 }), P(cyl(0.28, 0.22, 0.1, 10), 0x2a2a30, { y: -0.18, z: 0.45 }), P(sph(0.06), 0x7a3a1a, { x: 0.08, y: -0.11, z: 0.45 }), P(sph(0.06), 0x7a3a1a, { x: -0.08, y: -0.11, z: 0.5 })]); },
  flag() { return merge([P(cyl(0.02, 0.02, 1.2, 4), 0xdddddd, { y: 0.35 }), P(box(0.02, 0.32, 0.46), 0x3a8ae0, { y: 0.8, z: 0.24 })]); },
  snowball() { return merge([P(sph(0.16), 0xffffff, { y: -0.5 })]); },
  // --- chats debout (les gens du château) ------------------------------------------------------
  cat() {
    const f = 0xffffff, light = 0xfff8f0, pink = 0xf2a0b0, N = FACE.NECK.cat, R = FACE.RIG;
    const parts = [P(cyl(0.1, 0.11, 0.45, 6), f, { x: 0.15, y: 0.22 }), P(cyl(0.1, 0.11, 0.45, 6), f, { x: -0.15, y: 0.22 }),
      P(sph(0.12), light, { x: 0.15, y: 0.04, z: 0.07, sz: 1.4, sy: 0.6 }), P(sph(0.12), light, { x: -0.15, y: 0.04, z: 0.07, sz: 1.4, sy: 0.6 }),
      P(sph(0.34, 10, 8), f, { y: 0.78, sy: 1.25, sz: 0.9 }), P(sph(0.3, 14, 10), f, { y: 1.44, sx: 1.08, sy: 0.95, neck: N }),
      P(sph(0.13, 10, 8), light, { y: 1.35, z: 0.24, sx: 1.35, sy: 0.72, neck: N }), P(sph(0.036, 6, 5), pink, { y: 1.405, z: 0.355, sx: 1.3, neck: N }),
      // (yeux : le décalque du visage — lifeface.js) ; oreilles qui frémissent, joues duveteuses
      P(cone(0.12, 0.26, 4), f, { x: 0.17, y: 1.72, z: 0.0, rz: -0.35, rig: [R.EAR_R, 0.14, 1.62, 0], neck: N }), P(cone(0.12, 0.26, 4), f, { x: -0.17, y: 1.72, z: 0.0, rz: 0.35, rig: [R.EAR_L, -0.14, 1.62, 0], neck: N }),
      P(cone(0.07, 0.15, 4), pink, { x: 0.165, y: 1.7, z: 0.05, rz: -0.35, rig: [R.EAR_R, 0.14, 1.62, 0], neck: N }), P(cone(0.07, 0.15, 4), pink, { x: -0.165, y: 1.7, z: 0.05, rz: 0.35, rig: [R.EAR_L, -0.14, 1.62, 0], neck: N }),
      P(cone(0.07, 0.14, 4), f, { x: 0.3, y: 1.33, z: 0.04, rz: -2.0, neck: N }), P(cone(0.07, 0.14, 4), f, { x: -0.3, y: 1.33, z: 0.04, rz: 2.0, neck: N }),
      P(cyl(0.055, 0.04, 0.9, 6), f, { y: 0.7, z: -0.5, rx: -0.75, rig: [R.TAIL, 0, 0.42, -0.25] }), P(sph(0.06), light, { y: 1.02, z: -0.82, rig: [R.TAIL, 0, 0.42, -0.25] })];
    for (const s of [-1, 1]) for (const k of [-1, 1]) parts.push(P(box(0.26, 0.008, 0.008), 0xf8f8f8, { x: s * 0.2, y: 1.37 + k * 0.025, z: 0.3, rz: s * k * 0.12, neck: N }));
    return merge(parts);
  },
  /** Tunique et col (teintés), sans bonnet : les oreilles restent dehors. */
  catCloth() {
    const w = 0xffffff;
    return merge([P(cyl(0.34, 0.43, 0.6, 10), w, { y: 0.68 }), P(tor(0.24, 0.07, 6, 14), w, { y: 1.12, rx: Math.PI / 2 }), P(box(0.7, 0.07, 0.6), 0xd8d0c0, { y: 0.48 })]);
  },
  // coiffes (posées sur la tête, origine = pied du personnage)
  toque() { return merge([P(cyl(0.2, 0.18, 0.3, 10), 0xfafafa, { y: 1.78 }), P(sph(0.27, 10, 6), 0xffffff, { y: 2.0, sy: 0.65 })]); },
  jester() {
    const parts = [P(cyl(0.3, 0.31, 0.12, 12), 0xffd23a, { y: 1.66 })];
    for (const [s, col] of [[-1, 0xd83a4a], [1, 0x3a6ad8]]) parts.push(P(cone(0.15, 0.6, 7), col, { x: s * 0.25, y: 1.95, rz: -s * 0.85 }), P(sph(0.07), 0xffd23a, { x: s * 0.5, y: 2.08 }));
    parts.push(P(cone(0.13, 0.5, 7), 0x3ab060, { y: 2.0, z: -0.08, rx: -0.4 }), P(sph(0.065), 0xffd23a, { y: 2.22, z: -0.2 }));
    return merge(parts);
  },
  helmet() { return merge([P(sph(0.33, 12, 6, 0, TAU, 0, Math.PI / 2), 0xc8ccd4, { y: 1.58, sy: 0.85 }), P(cyl(0.34, 0.34, 0.06, 12), 0xa8acb4, { y: 1.6 }), P(box(0.05, 0.22, 0.42), 0xd83a3a, { y: 1.95, z: -0.05 })]); },
  beret() { return merge([P(sph(0.3, 12, 6), 0x3a5ad8, { x: 0.04, y: 1.7, sy: 0.35, rz: -0.2 }), P(sph(0.05), 0x3a5ad8, { x: 0.04, y: 1.82 })]); },
  hood() { return merge([P(sph(0.34, 12, 8, 0, TAU, 0, Math.PI * 0.62), 0x6a5a8a, { y: 1.42, sy: 1.05 })]); },
  crownlet() { return merge([P(cyl(0.2, 0.22, 0.12, 10, 1, true), 0xffc830, { y: 1.74 }), ...[0, 1, 2, 3, 4].map(i => P(cone(0.05, 0.12, 4), 0xffc830, { x: Math.cos(i * 1.256) * 0.2, y: 1.85, z: Math.sin(i * 1.256) * 0.2 }))]); },
  // outils des chats (dans la patte droite ; origine = bout du bras)
  ladle() { return merge([P(cyl(0.02, 0.02, 0.7, 5), 0xb8b0a0, { y: -0.1, rx: 0.4 }), P(sph(0.12, 8, 5, 0, TAU, Math.PI / 2, Math.PI / 2), 0xc8c0b0, { y: -0.45, z: -0.14 })]); },
  brush() { return merge([P(cyl(0.02, 0.025, 0.55, 5), 0xc8a060, { y: -0.05, rx: 0.5 }), P(cone(0.04, 0.12, 6), 0x3a6ad8, { y: -0.36, z: -0.15, rx: 0.5 + Math.PI })]); },
  palette() { return merge([P(cyl(0.22, 0.22, 0.03, 12), 0xd8b080, { y: -0.4, z: 0.15, rx: 1.3 }), ...[0xd83a3a, 0x3a6ad8, 0xffd23a, 0x3ab060].map((c, i) => P(sph(0.04), c, { x: Math.cos(i * 1.4) * 0.13, y: -0.42 + 0.03, z: 0.15 + Math.sin(i * 1.4) * 0.13 }))]); },
  spear() { return merge([P(cyl(0.025, 0.025, 2.4, 5), 0x8a5a30, { y: 0.4 }), P(cone(0.07, 0.25, 4), 0xd8dce4, { y: 1.72 }), P(box(0.02, 0.18, 0.12), 0xd83a3a, { y: 1.45, z: 0.07 })]); },
  sword() { return merge([P(box(0.06, 0.7, 0.02), 0xd8c8a0, { y: -0.6 }), P(box(0.22, 0.04, 0.04), 0x8a5a30, { y: -0.22 }), P(cyl(0.025, 0.025, 0.14, 5), 0x8a5a30, { y: -0.12 })]); },
  baton() { return merge([P(cyl(0.012, 0.008, 0.5, 4), 0xffffff, { y: -0.2, z: 0.2, rx: 0.9 }), P(sph(0.03), 0x3a2a20, { y: -0.04, z: 0.02 })]); },
  lute() { return merge([P(sph(0.22, 10, 6), 0xc8803a, { x: -0.1, y: -0.3, z: 0.28, sz: 0.35, sy: 1.15, rz: 0.9 }), P(box(0.05, 0.55, 0.04), 0x6a3a1a, { x: -0.4, y: -0.05, z: 0.3, rz: 0.9 }), P(cyl(0.05, 0.05, 0.02, 10), 0x2a1a10, { x: -0.1, y: -0.3, z: 0.36, rx: Math.PI / 2 })]); },
  drumstick() { return merge([P(cyl(0.015, 0.02, 0.4, 4), 0xd8c8a0, { y: -0.15, z: 0.12, rx: 0.8 }), P(sph(0.04), 0xffffff, { y: -0.02, z: 0.28 })]); },
  broom() { return merge([P(cyl(0.025, 0.025, 1.4, 5), 0x8a5a30, { y: -0.1, z: 0.1, rx: 0.3 }), P(cone(0.16, 0.4, 8), 0xd8b860, { y: -0.85, z: -0.12, rx: 0.3 + Math.PI })]); },
  can() { return merge([P(cyl(0.13, 0.15, 0.3, 10), 0x5aa0c0, { y: -0.45, z: 0.1 }), P(cyl(0.02, 0.03, 0.4, 5), 0x5aa0c0, { y: -0.4, z: 0.38, rx: 1.0 }), P(tor(0.1, 0.02, 4, 10, Math.PI), 0x4a8aa8, { y: -0.27, z: 0.05 })]); },
  book() { return merge([P(box(0.3, 0.04, 0.22), 0xf4ece0, { y: -0.42, z: 0.18, rx: 0.5 }), P(box(0.32, 0.03, 0.24), 0x8a2a3a, { y: -0.45, z: 0.18, rx: 0.5 })]); },
  pole() { return merge([P(cyl(0.02, 0.025, 1.9, 5), 0x6a4a2a, { y: 0.35 }), P(cyl(0.05, 0.03, 0.12, 6), 0x3a3a3a, { y: 1.3 }), P(cone(0.04, 0.12, 6), 0xffb040, { y: 1.42 })]); },
  trumpet() { return merge([P(cyl(0.02, 0.02, 0.5, 5), 0xffc830, { y: -0.2, z: 0.25, rx: 1.2 }), P(cone(0.1, 0.16, 10, true), 0xffc830, { y: -0.08, z: 0.5, rx: -0.4 })]); },
  jball() { return merge([P(sph(0.08, 8, 6), 0xffffff)]); },
  /** Heaume d'armure (posé au sommet d'une armure ; origine = bas du heaume). */
  knight() {
    return merge([P(sph(0.25, 12, 8), 0xd8dce4, { y: 0.24, sy: 1.12 }), P(box(0.34, 0.05, 0.1), 0x2a2a30, { y: 0.27, z: 0.22 }), P(box(0.3, 0.035, 0.1), 0x2a2a30, { y: 0.19, z: 0.22 }),
      P(cyl(0.04, 0.06, 0.12, 6), 0xffd23a, { y: 0.52 }), P(sph(0.12, 8, 6), 0xd83a3a, { y: 0.66, z: -0.08, sz: 1.8, sy: 0.8 })]);
  },
  // outils de la ferme
  pitchfork() { return merge([P(cyl(0.025, 0.025, 1.6, 5), 0x9a6a3a, { y: 0.1 }), P(box(0.3, 0.04, 0.04), 0x707078, { y: -0.72 }), ...[-0.13, 0, 0.13].map(x => P(cyl(0.012, 0.006, 0.36, 4), 0x707078, { x, y: -0.92 }))]); },
  basket() { return merge([P(cyl(0.22, 0.16, 0.22, 10, 1, true), 0xb88a50, { y: -0.6, z: 0.12 }), P(cyl(0.16, 0.16, 0.02, 10), 0xa07a40, { y: -0.7, z: 0.12 }), P(tor(0.2, 0.02, 4, 12, Math.PI), 0xa07a40, { y: -0.5, z: 0.12 }), P(sph(0.06), 0xf8f0dc, { x: 0.05, y: -0.52, z: 0.12, sy: 1.25 }), P(sph(0.06), 0xf0e0c0, { x: -0.06, y: -0.53, z: 0.16, sy: 1.25 })]); },
  crook() { return merge([P(cyl(0.025, 0.025, 1.8, 5), 0x8a5a30, { y: 0.2 }), P(tor(0.12, 0.025, 4, 10, Math.PI * 1.2), 0x8a5a30, { y: 1.15, x: 0.12 })]); },
  sack() { return merge([P(sph(0.28, 9, 7), 0xd8c49a, { y: -0.2, z: -0.1, sy: 1.3 }), P(cyl(0.06, 0.1, 0.12, 6), 0xc8b48a, { y: 0.17, z: -0.1 })]); },
  scarecrow() {
    const straw = 0xe8c860, shirt = 0xc84838, jeans = 0x4a6a9a;
    const parts = [P(cyl(0.06, 0.07, 2.0, 6), 0x8a6040, { y: 1.0 }), P(cyl(0.3, 0.36, 0.7, 8), shirt, { y: 1.45 }), P(cyl(0.24, 0.3, 0.45, 8), jeans, { y: 0.95 }),
      P(sph(0.27, 10, 8), 0xf0dca0, { y: 2.05 }), ...eyes(0.09, 2.1, 0.23, 0.04), P(tor(0.06, 0.012, 4, 8, Math.PI), 0x3a2a1a, { y: 1.98, z: 0.25, rz: Math.PI }),
      P(cone(0.05, 0.14, 5), 0xf07a1a, { y: 2.03, z: 0.32, rx: Math.PI / 2 })];
    for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; parts.push(P(cone(0.04, 0.22, 4), straw, { x: Math.cos(a) * 0.3, y: 0.75, z: Math.sin(a) * 0.3, rx: Math.PI + Math.sin(a) * 0.3, rz: Math.cos(a) * 0.3 })); }
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; parts.push(P(cone(0.04, 0.2, 4), straw, { x: Math.cos(a) * 0.2, y: 1.8, z: Math.sin(a) * 0.2, rx: Math.PI })); }
    return merge(parts);
  },
  scarecrowArm() { return merge([P(cyl(0.09, 0.08, 0.75, 6), 0xc84838, { y: -0.36 }), P(cone(0.08, 0.22, 5), 0xe8c860, { y: -0.82, rx: Math.PI })]); },
  // tenue d'été (teintée) : tee-shirt à manches courtes, short ; chapeau de paille et lunettes noires
  summer() {
    const w = 0xffffff;
    return merge([P(cyl(0.35, 0.41, 0.5, 12), w, { y: 0.74 }), P(sph(0.16, 8, 6), w, { x: 0.33, y: 1.0, sy: 0.8 }), P(sph(0.16, 8, 6), w, { x: -0.33, y: 1.0, sy: 0.8 }),
      P(cyl(0.38, 0.36, 0.2, 12), 0xdcdcdc, { y: 0.42 }), P(tor(0.17, 0.04, 5, 12), w, { y: 1.04, z: 0.04, rx: Math.PI / 2 })]);
  },
  sunhat() {
    const straw = 0xe8cc88;
    return merge([P(cyl(0.52, 0.55, 0.03, 16), straw, { y: 1.74 }), P(cyl(0.25, 0.29, 0.22, 12), straw, { y: 1.86 }), P(cyl(0.295, 0.295, 0.06, 12), 0xc83a3a, { y: 1.78 }),
      P(box(0.13, 0.08, 0.03), 0x15151a, { x: 0.1, y: 1.55, z: 0.36 }), P(box(0.13, 0.08, 0.03), 0x15151a, { x: -0.1, y: 1.55, z: 0.36 }), P(box(0.08, 0.015, 0.02), 0x15151a, { y: 1.57, z: 0.37 })]);
  },
  spade() { return merge([P(cyl(0.025, 0.025, 0.55, 5), 0xf0c020, { y: -0.1, rx: 0.3 }), P(box(0.2, 0.03, 0.24), 0xe84a3a, { y: -0.4, z: 0.1, rx: 0.6 })]); },
  surfboard() { return merge([P(sph(0.5, 12, 6), 0x3ab0e8, { y: -0.2, z: -0.12, sx: 0.36, sy: 2.6, sz: 0.06 }), P(box(0.04, 2.2, 0.065), 0xffffff, { y: -0.2, z: -0.12 }), P(cone(0.05, 0.12, 4), 0x2a6a9a, { y: -1.2, z: -0.18, rx: -Math.PI / 2 })]); },
  ukulele() { return merge([P(sph(0.16, 9, 6), 0xb87a3a, { x: -0.18, y: -0.35, z: 0.28, sz: 0.35 }), P(sph(0.12, 8, 5), 0xb87a3a, { x: -0.05, y: -0.3, z: 0.3, sz: 0.35 }), P(cyl(0.04, 0.04, 0.02, 8), 0x2a1a10, { x: -0.16, y: -0.35, z: 0.34, rx: Math.PI / 2 }), P(box(0.05, 0.42, 0.03), 0x5a3a20, { x: 0.12, y: -0.3, z: 0.3, rz: 1.2 })]); },
  shrimpnet() { return merge([P(cyl(0.02, 0.02, 1.3, 5), 0xc8a060, { y: -0.2, z: 0.4, rx: 1.1 }), P(tor(0.2, 0.02, 4, 12), 0x3a7ad8, { y: -0.45, z: 1.0, rx: 0.4 }), P(cone(0.19, 0.3, 8), 0xf0f0f0, { y: -0.6, z: 1.0, rx: Math.PI + 0.4 })]); },
  vball() { return merge([P(sph(0.2, 10, 8, 0, Math.PI), 0xffffff, { y: -0.6, z: 0.15 }), P(sph(0.2, 10, 8, Math.PI, Math.PI), 0xf0c030, { y: -0.6, z: 0.15 })]); },
  tray() { const p = [P(box(0.6, 0.04, 0.4), 0xb88a50, { y: -0.45, z: 0.3 }), P(box(0.62, 0.08, 0.02), 0xa07040, { y: -0.41, z: 0.5 })]; for (let i = 0; i < 6; i++) p.push(P(sph(0.07, 6, 5), 0xd89850, { x: -0.2 + (i % 3) * 0.2, y: -0.39, z: 0.22 + Math.floor(i / 3) * 0.15, sy: 0.7 })); return merge(p); },
  spool() { return merge([P(cyl(0.08, 0.08, 0.18, 8), 0xc8a060, { y: -0.45, rz: Math.PI / 2 }), P(cyl(0.004, 0.004, 3.0, 3), 0xf0f0f0, { y: 1.0, z: 0.5, rx: 0.35 })]); },
  /** Câble d'une plate-forme suspendue (hauteur 1 : étiré à la demande). */
  cable() { return merge([P(cyl(0.025, 0.025, 1, 4), 0x3a3a40, { y: 0.5 })]); },
};

// Objets
export const PROPS = {
  drift(c) {
    const top = c.top || 0x8ad8ff;
    const parts = [P(sph(1.4, 14, 6, 0, TAU, 0, Math.PI / 2), 0xf6f9ff, { sy: 0.36 }), P(tor(0.85, 0.09, 5, 20), top, { y: 0.4, rx: Math.PI / 2, sy: 1 }),
      P(cyl(0.5, 0.55, 0.04, 14), c.mid || 0xbfeaff, { y: 0.47 })];
    for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; parts.push(P(sph(0.08), c.dots || 0xff7ab0, { x: Math.cos(a) * 1.15, y: 0.25, z: Math.sin(a) * 1.15 })); }
    return { geo: merge(parts), h: 0.5, r: 1.3 };
  },
  pine() {
    // vrai sapin (branches scannées, neige dessus) quand les textures sont chargées
    if (FOL.hasFir()) return { geo: FOL.firGeometry(7, { height: 3.4, radius: 1.2, levels: 7 }), mat: firMat(), h: 3.3, r: 0.5, shadow: true };
    const parts = [P(cyl(0.12, 0.18, 0.9), 0x5a3a24, { y: 0.45 })];
    for (let i = 0; i < 3; i++) { const r = 1.1 - i * 0.3, h = 1.3 - i * 0.15, y0 = 0.6 + i * 0.8; parts.push(P(cone(r, h, 8), [0x24503a, 0x2a5c40, 0x316848][i], { y: y0 + h / 2 }), P(cone(r * 0.55, h * 0.45, 8), 0xf2f6fc, { y: y0 + h - h * 0.22 + 0.02 })); }
    return { geo: merge(parts), h: 3.3, r: 0.5 };
  },
  pile() {
    return { geo: merge([P(sph(0.7, 9, 6), 0xf2f6fc, { y: 0.1, sy: 0.75 }), P(sph(0.5, 8, 6), 0xeaf0fa, { x: 0.45, y: 0.05, z: 0.2, sy: 0.7 }), P(sph(0.45, 8, 6), 0xf6f9ff, { x: -0.35, y: 0.08, z: -0.3, sy: 0.8 }),
      P(new THREE.OctahedronGeometry(0.09), 0xbfeaff, { x: 0.2, y: 0.62, z: 0.1 }), P(new THREE.OctahedronGeometry(0.07), 0xffffff, { x: -0.3, y: 0.5, z: 0.25 })]), h: 0.7, r: 0.8 };
  },
  iceblock() {
    return { geo: merge([P(box(1.0, 0.9, 1.0), 0x9ad8f4, { y: 0.45, ry: 0.4 }), P(box(1.05, 0.12, 1.05), 0xf4f8ff, { y: 0.93, ry: 0.4 }), P(new THREE.OctahedronGeometry(0.2), 0xd8f4ff, { y: 0.55, z: 0.5, sy: 1.5 })]), h: 1.0, r: 0.7 };
  },
  snowman() {
    return { geo: merge([P(sph(0.55, 10, 8), 0xf6f9ff, { y: 0.5 }), P(sph(0.4, 10, 8), 0xf6f9ff, { y: 1.2 }), P(sph(0.29, 10, 8), 0xf6f9ff, { y: 1.75 }),
      ...eyes(0.1, 1.83, 0.24, 0.04), P(cone(0.05, 0.32, 6), 0xf07a1a, { y: 1.75, z: 0.4, rx: Math.PI / 2 }), P(sph(0.04), 0x1a1a1e, { y: 1.3, z: 0.39 }),
      P(cyl(0.02, 0.03, 0.7, 4), 0x5a3a24, { x: 0.6, y: 1.35, rz: -1.0 }), P(cyl(0.02, 0.03, 0.7, 4), 0x5a3a24, { x: -0.6, y: 1.35, rz: 1.0 })]), h: 2.0, r: 0.6 };
  },
  ball() { return { geo: merge([P(new THREE.IcosahedronGeometry(1, 2), 0xf6f9ff)]), h: 1, r: 1 }; },
  chime() {
    const ice = 0xb8e8ff, parts = [P(cyl(0.09, 0.12, 2.3, 6), ice, { x: 0.9, y: 1.15 }), P(cyl(0.09, 0.12, 2.3, 6), ice, { x: -0.9, y: 1.15 }), P(box(2.1, 0.16, 0.22), 0xf4f8ff, { y: 2.32 })];
    for (let i = 0; i < 5; i++) { const len = 0.55 + (i % 3) * 0.22 + i * 0.05; parts.push(P(cone(0.07, len, 5), [0x9ae0ff, 0xc8b8ff, 0x9affe0, 0xffe09a, 0xffb0d8][i], { x: -0.64 + i * 0.32, y: 2.22 - len / 2, rx: Math.PI })); }
    return { geo: merge(parts), h: 2.4, r: 0.4 };
  },
  // --- le château (matières : tex = nom d'une matière fournie par le monde, dans cfg.mats) --------
  /** Gros pouf moelleux : on rebondit dessus. */
  pouf() {
    const parts = [P(sph(1.3, 18, 8, 0, TAU, 0, Math.PI / 2), 0xffffff, { sy: 0.48 }), P(tor(1.24, 0.08, 6, 28), 0xffe6a0, { y: 0.06, rx: Math.PI / 2 }), P(sph(0.09), 0xffe6a0, { y: 0.63 })];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; parts.push(P(sph(0.07), 0xffe6a0, { x: Math.cos(a) * 0.62, y: 0.54, z: Math.sin(a) * 0.62 })); }
    return { geo: merge(parts), h: 0.62, r: 1.3, tex: 'fabric' };
  },
  /** Buis taillé en chat assis, dans son pot. */
  topiary() {
    const leaf = [P(sph(0.62, 12, 10), 0x7ab858, { y: 0.62 + 0.45, sx: 1.25, sz: 1.2, sy: 0.7 }), P(sph(0.72, 12, 10), 0x8ac060, { y: 0.62 + 1.25, sy: 1.1 }),
      P(sph(0.5, 12, 10), 0x8ac868, { y: 0.62 + 2.35, z: 0.15 }), P(cone(0.19, 0.4, 6), 0x7ab858, { x: 0.27, y: 0.62 + 2.82, z: 0.1, rz: -0.3 }), P(cone(0.19, 0.4, 6), 0x7ab858, { x: -0.27, y: 0.62 + 2.82, z: 0.1, rz: 0.3 }),
      P(tor(0.5, 0.15, 6, 12, Math.PI * 1.1), 0x7ab858, { x: -0.55, y: 0.62 + 1.05, z: -0.6, ry: 0.9 })];
    const pot = [P(lathe([[0.01, 0], [0.5, 0], [0.6, 0.5], [0.7, 0.55], [0.7, 0.66], [0.01, 0.66]], 14), 0xd08a60), P(tor(0.66, 0.05, 5, 18), 0xf0d0b0, { y: 0.4, rx: Math.PI / 2 })];
    return { geo: mergeGroups([leaf, pot]), h: 3.3, r: 0.75, tex: ['leaves', 'clay'] };
  },
  cask() {
    const parts = [P(lathe([[0.01, 0], [0.42, 0], [0.5, 0.3], [0.53, 0.55], [0.5, 0.8], [0.42, 1.1], [0.01, 1.1]], 14), 0xd8a878)];
    for (const [y, r] of [[0.16, 0.47], [0.55, 0.535], [0.94, 0.47]]) parts.push(P(tor(r, 0.03, 4, 18), 0x4a4038, { y, rx: Math.PI / 2 }));
    return { geo: merge(parts), h: 1.1, r: 0.55, tex: 'wood' };
  },
  caisse() {
    const parts = [P(box(1, 1, 1), 0xe0b888, { y: 0.5 })];
    for (const [x, z] of [[0.47, 0.47], [-0.47, 0.47], [0.47, -0.47], [-0.47, -0.47]]) parts.push(P(box(0.1, 1.02, 0.1), 0x9a6a40, { x, y: 0.5, z }));
    for (const s of [-1, 1]) { parts.push(P(box(0.08, 1.3, 0.04), 0x9a6a40, { y: 0.5, z: s * 0.51, rz: 0.78 })); parts.push(P(box(0.04, 1.3, 0.08), 0x9a6a40, { x: s * 0.51, y: 0.5, rx: 0.78 })); }
    return { geo: merge(parts), h: 1.0, r: 0.7, tex: 'wood' };
  },
  urn() {
    return { geo: merge([P(lathe([[0.01, 0], [0.24, 0], [0.4, 0.28], [0.43, 0.5], [0.32, 0.78], [0.2, 0.88], [0.27, 1.0], [0.01, 0.98]], 14), 0xd8875a),
      P(tor(0.425, 0.03, 4, 18), 0xf4e0c0, { y: 0.48, rx: Math.PI / 2 }), P(tor(0.4, 0.025, 4, 18), 0x3a6a8a, { y: 0.38, rx: Math.PI / 2 })]), h: 1.0, r: 0.45, tex: 'clay' };
  },
  hay() {
    return { geo: merge([P(cyl(0.62, 0.62, 1.3, 14), 0xf0d480, { y: 0.62, rz: Math.PI / 2 }), P(tor(0.63, 0.03, 4, 18), 0xa07a3a, { x: 0.35, y: 0.62, ry: Math.PI / 2 }), P(tor(0.63, 0.03, 4, 18), 0xa07a3a, { x: -0.35, y: 0.62, ry: Math.PI / 2 })]), h: 1.25, r: 0.75, tex: 'hay' };
  },
  /** Armure d'apparat (le casque est une « coiffe » qui saute : clong !). */
  armour() {
    const st = 0xd8dce4, dk = 0x9aa0aa;
    const parts = [P(box(0.9, 0.18, 0.7), 0x6a5040, { y: 0.09 }), P(cyl(0.1, 0.085, 0.82, 8), st, { x: 0.15, y: 0.6 }), P(cyl(0.1, 0.085, 0.82, 8), st, { x: -0.15, y: 0.6 }),
      P(sph(0.13), dk, { x: 0.15, y: 0.24, z: 0.07, sz: 1.5, sy: 0.6 }), P(sph(0.13), dk, { x: -0.15, y: 0.24, z: 0.07, sz: 1.5, sy: 0.6 }), P(sph(0.1), st, { x: 0.15, y: 0.62, z: 0.05 }), P(sph(0.1), st, { x: -0.15, y: 0.62, z: 0.05 }),
      P(cyl(0.3, 0.37, 0.32, 12), dk, { y: 1.08 }), P(sph(0.34, 14, 10), st, { y: 1.42, sy: 1.15, sz: 0.78 }), P(box(0.36, 0.62, 0.05), 0xb83040, { y: 1.18, z: 0.25 }), P(box(0.12, 0.12, 0.06), 0xffd23a, { y: 1.33, z: 0.28 }),
      P(sph(0.17), st, { x: 0.38, y: 1.68 }), P(sph(0.17), st, { x: -0.38, y: 1.68 }), P(cyl(0.08, 0.07, 0.6, 8), st, { x: 0.42, y: 1.32, rz: 0.12 }), P(cyl(0.08, 0.07, 0.6, 8), st, { x: -0.42, y: 1.32, rz: -0.12 }),
      P(sph(0.09), dk, { x: 0.45, y: 0.98 }), P(sph(0.09), dk, { x: -0.45, y: 0.98 }), P(cyl(0.11, 0.13, 0.12, 10), dk, { y: 1.86 }),
      P(cyl(0.025, 0.025, 2.5, 5), 0x6a4a2a, { x: 0.5, y: 1.25, z: 0.08 }), P(box(0.04, 0.35, 0.3), st, { x: 0.5, y: 2.3, z: 0.22 }), P(cone(0.05, 0.2, 4), st, { x: 0.5, y: 2.6, z: 0.08 })];
    return { geo: merge(parts), h: 2.4, r: 0.5, tex: 'metal' };
  },
  /** La cloche de l'orchestre, sur son portique de bois. */
  bell() {
    const wood = [P(box(0.14, 2.3, 0.14), 0xc8a070, { x: 0.72, y: 1.15 }), P(box(0.14, 2.3, 0.14), 0xc8a070, { x: -0.72, y: 1.15 }), P(box(1.8, 0.18, 0.2), 0xb89060, { y: 2.3 }), P(box(1.7, 0.1, 0.5), 0xa88050, { y: 0.05 })];
    const brass = [P(lathe([[0.01, 0.62], [0.2, 0.55], [0.25, 0.35], [0.36, 0.08], [0.4, 0.0], [0.34, 0.02], [0.01, 0.1]], 16), 0xffd890, { y: 1.42 }), P(sph(0.08), 0xd8b060, { y: 1.45 }), P(cyl(0.02, 0.02, 0.2, 4), 0x8a7a60, { y: 2.12 })];
    return { geo: mergeGroups([wood, brass]), h: 2.4, r: 0.45, tex: ['wood', 'gold'] };
  },
  /** Brasero de fer forgé (on l'allume en le touchant, ou d'un « Ouaf ! »). */
  brazier() {
    const ir = 0x5a5a64, parts = [];
    for (let i = 0; i < 3; i++) { const a = i / 3 * TAU; parts.push(P(cyl(0.04, 0.04, 1.2, 5), ir, { x: Math.cos(a) * 0.22, y: 0.55, z: Math.sin(a) * 0.22, rx: Math.sin(a) * 0.3, rz: -Math.cos(a) * 0.3 })); }
    parts.push(P(lathe([[0.01, 0], [0.25, 0.02], [0.48, 0.25], [0.52, 0.32], [0.46, 0.3], [0.01, 0.08]], 14), ir, { y: 1.05 }), P(sph(0.3, 8, 5), 0x3a2a24, { y: 1.22, sy: 0.4 }), P(tor(0.5, 0.025, 4, 16), 0xb89040, { y: 1.36, rx: Math.PI / 2 }));
    return { geo: merge(parts), h: 1.4, r: 0.5, tex: 'metal' };
  },
  candelabra() {
    const br = 0xe8c070, parts = [P(lathe([[0.01, 0], [0.32, 0], [0.3, 0.06], [0.1, 0.2], [0.06, 0.3], [0.01, 0.3]], 12), br), P(cyl(0.04, 0.05, 1.6, 6), br, { y: 1.05 })];
    for (const s of [-1, 0, 1]) {
      if (s) parts.push(P(tor(0.25, 0.03, 4, 10, Math.PI), br, { x: s * 0.25, y: 1.75, rz: Math.PI, ry: s > 0 ? 0 : Math.PI }));
      parts.push(P(cyl(0.07, 0.05, 0.06, 8), br, { x: s * 0.5, y: s ? 1.78 : 1.88 }), P(cyl(0.045, 0.045, 0.32, 6), 0xfff4e0, { x: s * 0.5, y: (s ? 1.78 : 1.88) + 0.18 }));
    }
    return { geo: merge(parts), h: 2.2, r: 0.35, tex: 'gold' };
  },
  /** Portrait d'un noble chat (cadre doré + tableau) ; ses yeux suivent les chiens (palette : eyes). */
  portrait() {
    const fr = 0xffffff, frame = [];
    for (const [x, y, w, h] of [[0, 1.42, 1.3, 0.14], [0, 2.98, 1.3, 0.14], [-0.6, 2.2, 0.12, 1.6], [0.6, 2.2, 0.12, 1.6]]) frame.push(P(box(w, h, 0.12), fr, { x, y, z: 0.0 }));
    frame.push(P(sph(0.1, 8, 6), fr, { y: 3.1, z: 0.02 }));
    const pic = [P(new THREE.PlaneGeometry(1.1, 1.45), 0xffffff, { y: 2.2, z: 0.02, uvKeep: true })];
    return { geo: mergeGroups([frame, pic]), h: 3.1, r: 0.3, tex: ['gold', 'portrait'] };
  },
  pupil() { return { geo: merge([P(sph(1, 8, 6), 0x141414, { sz: 0.3 })]), h: 0.1, r: 0.05 }; },
  /** Bibliothèque : d'un grand coup, elle glisse… (passage secret). */
  bookcase() {
    const wd = 0xc89868, parts = [P(box(2.4, 2.7, 0.08), 0x9a6a48, { y: 1.35, z: -0.26 }), P(box(0.1, 2.7, 0.6), wd, { x: 1.15, y: 1.35 }), P(box(0.1, 2.7, 0.6), wd, { x: -1.15, y: 1.35 }), P(box(2.5, 0.12, 0.66), wd, { y: 2.74 })];
    const r = (s => () => (s = (s * 16807) % 2147483647) / 2147483647)(41);
    for (let j = 0; j < 4; j++) {
      const y = 0.08 + j * 0.66; parts.push(P(box(2.3, 0.06, 0.56), wd, { y }));
      for (let x = -1.05; x < 1.0;) { const w = 0.07 + r() * 0.07, h = 0.38 + r() * 0.18; parts.push(P(box(w, h, 0.36), [0x8a2a3a, 0x2a4a8a, 0x2a6a4a, 0xc89a3a, 0x6a3a7a, 0xa85a2a][Math.floor(r() * 6)], { x: x + w / 2, y: y + 0.03 + h / 2, z: 0.02, rz: r() < 0.12 ? 0.2 : 0 })); x += w + 0.012; }
    }
    return { geo: merge(parts), h: 2.8, r: 0.6, tex: 'wood' };
  },
  yarnball() { return { geo: merge([P(sph(1, 16, 12), 0xffffff), P(tor(0.98, 0.05, 5, 24), 0xffffff, { rx: 1.1 }), P(tor(0.99, 0.05, 5, 24), 0xffffff, { rx: 0.3, ry: 1.2 })]), h: 1, r: 1, tex: 'yarn' }; },
  /** Mannequin d'entraînement des écuyers (sac de paille, bouclier-cible). */
  dummy() {
    return { geo: merge([P(cyl(0.06, 0.07, 1.9, 6), 0x8a5a30, { y: 0.95 }), P(sph(0.36, 10, 8), 0xe8c880, { y: 1.25, sy: 1.3 }), P(sph(0.24, 10, 8), 0xe8c880, { y: 1.95 }),
      P(cyl(0.05, 0.05, 1.3, 5), 0x8a5a30, { y: 1.45, rz: Math.PI / 2 }), P(cyl(0.3, 0.3, 0.05, 14), 0xd83a3a, { y: 1.25, z: 0.33, rx: Math.PI / 2 }), P(cyl(0.18, 0.18, 0.055, 14), 0xf4f0e8, { y: 1.25, z: 0.34, rx: Math.PI / 2 }),
      P(cyl(0.07, 0.07, 0.06, 10), 0xd83a3a, { y: 1.25, z: 0.36, rx: Math.PI / 2 }), P(tor(0.25, 0.04, 4, 12), 0xa07a3a, { y: 1.62, rx: Math.PI / 2 }), P(box(0.5, 0.06, 0.5), 0x8a5a30, { y: 0.03 })]), h: 2.2, r: 0.45, tex: 'hay' };
  },
  /** Bouton en forme de patte, sur un socle de pierre. */
  pawbutton() {
    const parts = [P(lathe([[0.01, 0], [0.75, 0], [0.7, 0.3], [0.55, 0.36], [0.01, 0.36]], 16), 0xe8dcc8), P(sph(0.3, 12, 8), 0xf090a8, { y: 0.4, z: -0.05, sy: 0.35, sz: 0.85 })];
    for (let i = 0; i < 4; i++) { const a = -0.75 + i * 0.5; parts.push(P(sph(0.11, 10, 6), 0xf090a8, { x: Math.sin(a) * 0.36, y: 0.4, z: Math.cos(a) * 0.32, sy: 0.45 })); }
    return { geo: merge(parts), h: 0.5, r: 0.7, tex: 'stone' };
  },
  chest() {
    return { geo: merge([P(box(1.0, 0.55, 0.7), 0x8a5230, { y: 0.28 }), P(box(1.04, 0.08, 0.74), 0xe8b83a, { y: 0.1 }), P(box(1.04, 0.08, 0.74), 0xe8b83a, { y: 0.48 }), P(box(0.16, 0.2, 0.05), 0xe8c84a, { y: 0.48, z: 0.37 })]), h: 0.6, r: 0.6 };
  },
  lid() { return { geo: merge([P(cyl(0.35, 0.35, 1.0, 8, 1, false, 0, Math.PI), 0x9a6238, { y: 0, z: 0.35, rz: Math.PI / 2 }), P(box(1.04, 0.06, 0.08), 0xe8b83a, { y: 0.2, z: 0.35 })]), h: 0.4, r: 0.6 }; },
  lantern() {
    return { geo: merge([P(cyl(0.05, 0.07, 2.2, 5), 0x2a2a32, { y: 1.1 }), P(box(0.34, 0.4, 0.34), 0xffe0a0, { y: 2.35 }), P(cone(0.3, 0.24, 4), 0x2a2a32, { y: 2.67, ry: Math.PI / 4 }), P(cone(0.28, 0.12, 4), 0xf4f8ff, { y: 2.82, ry: Math.PI / 4 })]), h: 2.9, r: 0.2 };
  },
  button() {
    return { geo: merge([P(cyl(0.6, 0.7, 0.35, 12), 0xf2f6fc, { y: 0.17 }), P(cyl(0.38, 0.42, 0.22, 12), 0xe8403a, { y: 0.42 }), P(cyl(0.2, 0.2, 0.04, 10), 0xffffff, { y: 0.54 })]), h: 0.55, r: 0.6 };
  },
  hole(c) { return { geo: merge([P(cyl(0.55, 0.55, 0.02, 14), c.inner || c.dark || 0x16303e, { y: 0.03 }), P(tor(0.58, 0.08, 4, 16), c.rim || 0xeef6ff, { y: 0.05, rx: Math.PI / 2, sz: 0.4 })]), h: 0.1, r: 0.6 }; },
  // --- bord de mer ---
  /** Château de sable (il se bâtit en plusieurs étapes : voir l'action « build »). */
  castle(c) {
    const s = c.sand || 0xe2c488, d = c.dark || 0xcaa868, parts = [P(sph(1.05, 14, 6, 0, TAU, 0, Math.PI / 2), d, { sy: 0.32 })];
    for (const [x, z] of [[0.6, 0.6], [-0.6, 0.6], [0.6, -0.6], [-0.6, -0.6]]) {
      parts.push(P(cyl(0.2, 0.26, 0.7, 10), s, { x, y: 0.5, z }));
      for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + 0.4; parts.push(P(box(0.08, 0.1, 0.08), s, { x: x + Math.cos(a) * 0.16, y: 0.9, z: z + Math.sin(a) * 0.16 })); }
    }
    parts.push(P(cyl(0.34, 0.42, 1.05, 12), s, { y: 0.7 }), P(cone(0.36, 0.42, 12), d, { y: 1.43 }));
    for (const [x, z, rz, rx] of [[0, 0.6, 0, 0], [0, -0.6, 0, 0], [0.6, 0, 1, 0], [-0.6, 0, 1, 0]]) parts.push(P(box(rz ? 0.12 : 0.95, 0.32, rz ? 0.95 : 0.12), s, { x, y: 0.35, z, rx }));
    parts.push(P(box(0.18, 0.28, 0.06), 0x5a4428, { y: 0.48, z: 0.42 }), P(sph(0.05, 6, 4), 0xfff0f4, { x: 0.25, y: 0.75, z: 0.37 }), P(sph(0.05, 6, 4), 0xffc8d8, { x: -0.22, y: 0.9, z: 0.34 }));
    return { geo: merge(parts), h: 1.65, r: 0.95 };
  },
  pennant() { return { geo: merge([P(cyl(0.012, 0.012, 0.6, 4), 0xf4ecd8, { y: 0.3 }), P(box(0.02, 0.18, 0.3), 0xe83a3a, { y: 0.5, z: 0.15 })]), h: 0.6, r: 0.1 }; },
  /** Parasol (teinté) : on rebondit sur la toile. */
  parasol() {
    const parts = [P(cyl(0.035, 0.035, 2.5, 6), 0xf2f2f2, { y: 1.25 })];
    for (let i = 0; i < 8; i++) parts.push(P(cyl(0.06, 1.45, 0.5, 3, 1, false, i / 8 * TAU, TAU / 8), i % 2 ? 0xffffff : 0x9a9a9a, { y: 2.35 }));
    for (let i = 0; i < 8; i++) { const a = (i + 0.5) / 8 * TAU; parts.push(P(sph(0.12, 5, 3), i % 2 ? 0xffffff : 0x9a9a9a, { x: Math.sin(a) * 1.4, y: 2.08, z: Math.cos(a) * 1.4, sy: 0.5 })); }
    parts.push(P(sph(0.07, 6, 4), 0xffffff, { y: 2.64 }));
    return { geo: merge(parts), h: 2.6, r: 1.45 };
  },
  /** Matelas gonflable (teinté) : un trampoline tout mou. */
  mattress() {
    const parts = [P(box(1.1, 0.16, 1.9), 0xffffff, { y: 0.12 })];
    for (let i = 0; i < 6; i++) parts.push(P(cyl(0.11, 0.11, 1.08, 8), i % 2 ? 0xffffff : 0xd0d0d0, { y: 0.2, z: -0.7 + i * 0.24, rz: Math.PI / 2 }));
    parts.push(P(cyl(0.16, 0.16, 1.08, 8), 0xf0f0f0, { y: 0.25, z: 0.82, rz: Math.PI / 2 }));
    return { geo: merge(parts), h: 0.35, r: 1.0 };
  },
  /** Touffe d'oyats (herbe des dunes). */
  oyat() {
    const parts = [P(sph(0.45, 8, 4, 0, TAU, 0, Math.PI / 2), 0xe2c890, { sy: 0.3 })];
    for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 0.08 + (i % 4) * 0.06, h = 0.8 + (i % 5) * 0.14; parts.push(P(cone(0.035, h, 3), i % 3 ? 0x9aa850 : 0xc8bc78, { x: Math.cos(a) * r, y: h / 2, z: Math.sin(a) * r, rx: Math.sin(a) * 0.35, rz: -Math.cos(a) * 0.35 })); }
    return { geo: merge(parts), h: 1.2, r: 0.45 };
  },
  /** Seau et pelle (teintés) dans un petit pâté de sable. */
  bucket() {
    return { geo: merge([P(sph(0.42, 9, 4, 0, TAU, 0, Math.PI / 2), 0xd8bc80, { sy: 0.25 }), P(cyl(0.24, 0.18, 0.34, 12, 1, true), 0xffffff, { y: 0.2 }), P(cyl(0.18, 0.18, 0.02, 12), 0xd8bc80, { y: 0.06 }),
      P(tor(0.24, 0.022, 4, 14), 0xffffff, { y: 0.37, rx: Math.PI / 2 }), P(tor(0.22, 0.012, 3, 10, Math.PI), 0xe0e0e0, { y: 0.37, ry: 0.4 }),
      P(cyl(0.022, 0.022, 0.45, 5), 0xf0c020, { x: 0.38, y: 0.2, z: 0.1, rz: -0.4 }), P(box(0.16, 0.025, 0.2), 0xe8e8e8, { x: 0.47, y: 0.03, z: 0.1 })]), h: 0.45, r: 0.35 };
  },
  /** Tonneau échoué (cerclé de fer). */
  barrel() {
    return { geo: merge([P(cyl(0.34, 0.3, 0.85, 12), 0x8a6038, { y: 0.42 }), P(cyl(0.36, 0.36, 0.06, 12), 0x3a3430, { y: 0.2 }), P(cyl(0.36, 0.36, 0.06, 12), 0x3a3430, { y: 0.66 }), P(cyl(0.29, 0.29, 0.03, 12), 0x6a4a2a, { y: 0.86 }), P(sph(0.25, 6, 3), 0x5a7a3a, { x: 0.1, y: 0.02, z: 0.3, sy: 0.25 })]), h: 0.9, r: 0.4 };
  },
  /** Tas d'algues (avec un coquillage dedans). */
  kelp() {
    const parts = [];
    for (let i = 0; i < 7; i++) { const a = i * 2.1; parts.push(P(sph(0.3, 7, 4), i % 2 ? 0x4a5a28 : 0x6a5a2a, { x: Math.cos(a) * 0.3 * (i % 3), y: 0.04, z: Math.sin(a) * 0.3 * (i % 3), sx: 1.4, sy: 0.22, ry: a })); }
    parts.push(P(sph(0.08, 6, 4), 0xffd8e0, { x: 0.25, y: 0.1, z: 0.1, sy: 0.6 }), P(sph(0.06, 5, 4), 0xf0e0c0, { x: -0.3, y: 0.09, z: -0.1, sy: 0.7 }));
    return { geo: merge(parts), h: 0.2, r: 0.7 };
  },
  /** Carillon de coquillages (bois flotté et coquillages suspendus) : il chante. */
  shellchime() {
    const wood = 0xb8a080, parts = [P(cyl(0.07, 0.09, 2.3, 6), wood, { x: 0.85, y: 1.15, rz: 0.05 }), P(cyl(0.07, 0.09, 2.3, 6), wood, { x: -0.85, y: 1.15, rz: -0.05 }), P(cyl(0.07, 0.07, 2.0, 6), wood, { y: 2.28, rz: Math.PI / 2 })];
    const cols = [0xffd8c8, 0xf8e8c0, 0xe8c8f0, 0xc8e8f0, 0xffc8a0];
    for (let i = 0; i < 5; i++) { const x = -0.6 + i * 0.3, len = 0.4 + (i % 3) * 0.15; parts.push(P(cyl(0.006, 0.006, len, 3), 0xe8e0d0, { x, y: 2.24 - len / 2 }), P(cone(0.09, 0.22, 7), cols[i], { x, y: 2.2 - len, rx: Math.PI }), P(sph(0.05, 6, 4), cols[i], { x, y: 2.1 - len - 0.12 })); }
    return { geo: merge(parts), h: 2.3, r: 0.45 };
  },
  /** Cerf-volant (teinté) au bout de sa ficelle, attaché à un piquet. */
  kite() {
    const parts = [P(cyl(0.03, 0.03, 0.5, 4), 0x8a6a40, { y: 0.2 })];
    const ty = 7.5, tz = -3.2, L = Math.hypot(ty, tz), a = Math.atan2(-tz, ty);
    parts.push(P(cyl(0.008, 0.008, L, 3), 0xf4f4f4, { y: ty / 2 + 0.3, z: tz / 2, rx: -a }));
    parts.push(P(new THREE.OctahedronGeometry(0.7, 0), 0xffffff, { y: ty + 0.6, z: tz - 0.1, sx: 0.75, sy: 1.0, sz: 0.06, rx: -0.4 }), P(box(0.02, 1.35, 0.03), 0x3a2a1a, { y: ty + 0.6, z: tz - 0.06, rx: -0.4 }), P(box(1.0, 0.02, 0.03), 0x3a2a1a, { y: ty + 0.75, z: tz - 0.11, rx: -0.4 }));
    for (let i = 0; i < 4; i++) parts.push(P(box(0.22, 0.08, 0.02), i % 2 ? 0xffffff : 0xd0d0d0, { x: Math.sin(i * 1.4) * 0.15, y: ty - 0.2 - i * 0.45, z: tz + 0.15 + i * 0.12, rz: i * 0.5 }));
    return { geo: merge(parts), h: ty + 1.2, r: 0.3 };
  },
  /** Filet de volley (deux poteaux, filet à mailles) : le long de l'axe x. */
  net() {
    const parts = [P(cyl(0.06, 0.06, 2.6, 6), 0xe8e8e8, { x: 3.2, y: 1.3 }), P(cyl(0.06, 0.06, 2.6, 6), 0xe8e8e8, { x: -3.2, y: 1.3 }), P(box(6.4, 0.08, 0.03), 0xffffff, { y: 2.42 })];
    for (let i = 0; i < 4; i++) parts.push(P(box(6.4, 0.015, 0.015), 0x2a2a2a, { y: 1.62 + i * 0.25 }));
    for (let i = 0; i <= 26; i++) parts.push(P(box(0.015, 0.8, 0.015), 0x2a2a2a, { x: -3.15 + i * 0.242, y: 2.0 }));
    return { geo: merge(parts), h: 2.5, r: 3.2 };
  },
  /** Serviette de plage (teintée, rayée). */
  towel() {
    const parts = [];
    for (let i = 0; i < 7; i++) parts.push(P(box(1.0, 0.03, 0.27), i % 2 ? 0xffffff : 0xa8a8a8, { y: 0.03, z: -0.81 + i * 0.27 }));
    return { geo: merge(parts), h: 0.05, r: 0.9 };
  },
  /** Touffe de fleurs sauvages (on la secoue). */
  wildflowers() {
    const parts = [P(sph(0.3, 7, 4), 0x4a7a30, { y: 0.1, sy: 0.5 })];
    const cols = [0xff7ab0, 0xffe040, 0xffffff, 0xb07aff, 0xff5a3a];
    for (let i = 0; i < 9; i++) { const a = i * 2.4, r = 0.12 + (i % 3) * 0.08, h = 0.3 + (i % 4) * 0.08; parts.push(P(cyl(0.012, 0.012, h, 3), 0x5a8a3a, { x: Math.cos(a) * r, y: h / 2, z: Math.sin(a) * r }), P(sph(0.06, 6, 4), cols[i % 5], { x: Math.cos(a) * r, y: h + 0.02, z: Math.sin(a) * r, sy: 0.6 })); }
    return { geo: merge(parts), h: 0.6, r: 0.35 };
  },
  marker() { return { geo: merge([P(tor(1.15, 0.1, 5, 24), 0xffd23a, { y: 0.08, rx: Math.PI / 2, sz: 0.5 }), P(cyl(1.0, 1.0, 0.03, 20), 0xfff2a8, { y: 0.03 })]), h: 0.1, r: 1.2 }; },
  star() { return { geo: merge([P(new THREE.OctahedronGeometry(0.32), 0xffe24a, { sy: 1.3 })]), h: 0.4, r: 0.3, unlit: true }; },
  coin() { return { geo: merge([P(new THREE.OctahedronGeometry(0.3), 0xff3a4a, { sz: 0.35, sy: 1.25 })]), h: 0.4, r: 0.3, unlit: true }; },
  ring() { return { geo: merge([P(tor(1.25, 0.13, 6, 22), 0xffc830, {})]), h: 2.5, r: 1.3 }; },
  // --- la ferme : meules, bottes, citrouilles, carottes, buissons, arbres fruitiers, épouvantails, ruches, puits,
  // girouettes, cloches, flaques, fleurs, œufs et pommes dorés (chaque objet porte sa matière : paille, bois, pierre…)
  haystack() {
    const s = 0xf0d070, parts = [P(sph(1.35, 16, 8, 0, TAU, 0, Math.PI / 2), s, { sy: 0.78 }), P(cyl(1.32, 1.4, 0.3, 16), 0xe0bc58, { y: 0.1 }),
      P(cone(0.5, 0.55, 10), 0xf4dc80, { y: 1.15 }), P(tor(1.0, 0.05, 4, 20), 0xb08a40, { y: 0.62, rx: Math.PI / 2 })];
    for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; parts.push(P(cone(0.1, 0.45, 4), 0xf4dc80, { x: Math.cos(a) * 1.35, y: 0.12, z: Math.sin(a) * 1.35, rz: -Math.cos(a) * 1.2, rx: Math.sin(a) * 1.2 })); }
    return { geo: merge(parts), h: 1.1, r: 1.3, skin: 'straw' };
  },
  bale() {
    return { geo: merge([P(box(1.2, 0.6, 0.65), 0xf0d478, { y: 0.3 }), P(box(0.05, 0.62, 0.67), 0x9a7838, { x: 0.32, y: 0.3 }), P(box(0.05, 0.62, 0.67), 0x9a7838, { x: -0.32, y: 0.3 }),
      P(cone(0.08, 0.3, 4), 0xf4dc80, { x: 0.62, y: 0.4, rz: -1.4 }), P(cone(0.08, 0.25, 4), 0xf4dc80, { x: -0.6, y: 0.2, rz: 1.3 })]), h: 0.65, r: 0.7, skin: 'straw' };
  },
  pumpkin() {
    const o = 0xf08a28, parts = [];
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; parts.push(P(sph(0.3, 10, 8), o, { x: Math.cos(a) * 0.16, y: 0.3, z: Math.sin(a) * 0.16, sy: 0.85 })); }
    parts.push(P(sph(0.3, 10, 8), 0xf89a38, { y: 0.32, sy: 0.9 }), P(cyl(0.04, 0.06, 0.18, 5), 0x6a7a30, { y: 0.62, rz: 0.3 }), P(sph(0.15, 6, 4), 0x4a8a30, { x: 0.22, y: 0.5, z: 0.15, sy: 0.15 }));
    return { geo: merge(parts), h: 0.7, r: 0.5, skin: 'pumpkin' };
  },
  carrots() {
    const parts = [P(sph(0.55, 12, 6, 0, TAU, 0, Math.PI / 2), 0x7a5232, { sy: 0.32 })];
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4, r = i ? 0.3 : 0, x = Math.cos(a) * r, z = Math.sin(a) * r;
      parts.push(P(cone(0.06, 0.16, 6), 0xf07a20, { x, y: 0.2, z }));
      for (let k = 0; k < 3; k++) parts.push(P(cone(0.035, 0.38, 4), 0x4a9a34, { x: x + Math.cos(k * 2.1) * 0.04, y: 0.42, z: z + Math.sin(k * 2.1) * 0.04, rx: Math.cos(k * 2.1) * 0.35, rz: Math.sin(k * 2.1) * 0.35 }));
    }
    return { geo: merge(parts), h: 0.6, r: 0.55, skin: 'leaf' };
  },
  fruittree() {
    const parts = [P(cyl(0.16, 0.24, 1.9, 8), 0x7a5a3a, { y: 0.95 }), P(cyl(0.07, 0.1, 0.9, 6), 0x7a5a3a, { x: 0.3, y: 1.9, rz: -0.6 })];
    const g = [0x5aa842, 0x4c9a3a, 0x68b84a];
    for (let i = 0; i < 7; i++) { const a = i * 2.3, r = i ? 0.8 : 0; parts.push(P(sph(0.9 - (i ? 0.25 : 0), 12, 9), g[i % 3], { x: Math.cos(a) * r, y: 2.6 + (i ? Math.sin(i * 1.7) * 0.35 : 0.3), z: Math.sin(a) * r })); }
    for (let i = 0; i < 12; i++) { const a = i * 2.4, e = Math.sin(i * 1.3) * 0.5; parts.push(P(sph(0.1, 8, 6), 0xe0302a, { x: Math.cos(a) * 1.05, y: 2.5 + e, z: Math.sin(a) * 1.05 })); }
    return { geo: merge(parts), h: 3.6, r: 0.4, skin: 'leaf' };
  },
  scarecrow() {
    const straw = 0xf0d070, parts = [P(cyl(0.07, 0.08, 2.5, 6), 0x8a6a48, { y: 1.25 }), P(box(2.2, 0.1, 0.1), 0x8a6a48, { y: 1.7 }),
      P(cyl(0.32, 0.4, 0.8, 8), 0xc84838, { y: 1.45 }), P(box(2.0, 0.24, 0.26), 0xc84838, { y: 1.7 }), P(sph(0.3, 10, 8), 0xf2dca0, { y: 2.2 }),
      ...eyes(0.1, 2.25, 0.26, 0.045), P(cone(0.05, 0.16, 5), 0xf07a1a, { y: 2.18, z: 0.36, rx: Math.PI / 2 })];
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) parts.push(P(cone(0.05, 0.3, 4), straw, { x: s * 1.1, y: 1.66 + (i - 1) * 0.08, z: (i - 1) * 0.08, rz: s * Math.PI / 2 }));
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; parts.push(P(cone(0.05, 0.3, 4), straw, { x: Math.cos(a) * 0.3, y: 0.98, z: Math.sin(a) * 0.3, rx: Math.PI })); }
    return { geo: merge(parts), h: 2.6, r: 0.4, skin: 'fabric' };
  },
  hive() {
    const parts = [P(box(1.0, 0.1, 1.0), 0x8a6a48, { y: 0.55 }), ...[[0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [-0.4, -0.4]].map(([x, z]) => P(box(0.1, 0.55, 0.1), 0x7a5a38, { x, y: 0.27, z }))];
    for (let i = 0; i < 5; i++) parts.push(P(tor(0.45 - i * 0.07, 0.12, 6, 16), 0xe8c060, { y: 0.72 + i * 0.17, rx: Math.PI / 2 }));
    parts.push(P(sph(0.2, 8, 6), 0xe8c060, { y: 1.42, sy: 0.6 }), P(box(0.2, 0.12, 0.1), 0x2a1a10, { y: 0.72, z: 0.45 }));
    return { geo: merge(parts), h: 1.5, r: 0.6, skin: 'straw' };
  },
  well() {
    const st = 0xd8d0c4, wd = 0x8a6040, parts = [P(cyl(1.0, 1.08, 0.9, 16, 1, true), st, { y: 0.45 }), P(cyl(0.82, 0.82, 0.9, 16, 1, true), 0xb0a89c, { y: 0.45 }),
      P(tor(0.92, 0.12, 6, 18), st, { y: 0.92, rx: Math.PI / 2 }), P(cyl(0.82, 0.82, 0.04, 16), 0x2a4a5a, { y: 0.3 })];
    for (const s of [-1, 1]) parts.push(P(box(0.14, 2.0, 0.14), wd, { x: s * 0.95, y: 1.6 }));
    parts.push(P(cyl(0.06, 0.06, 2.0, 6), wd, { y: 2.2, rz: Math.PI / 2 }), P(box(2.4, 0.08, 0.95), 0x9a4a32, { y: 2.85, z: 0.38, rx: 0.55 }), P(box(2.4, 0.08, 0.95), 0x9a4a32, { y: 2.85, z: -0.38, rx: -0.55 }),
      P(cyl(0.18, 0.14, 0.26, 8), 0x8a7a68, { y: 1.55 }), P(cyl(0.01, 0.01, 0.6, 3), 0xd8c49a, { y: 1.95 }));
    return { geo: merge(parts), h: 3.1, r: 1.1, skin: 'stone' };
  },
  vane() {
    const k = 0x2a2a30, parts = [P(cyl(0.05, 0.07, 3.2, 6), 0x7a5a3a, { y: 1.6 }), P(cyl(0.025, 0.025, 0.6, 5), k, { y: 3.4 }),
      P(box(1.0, 0.04, 0.04), k, { y: 3.3 }), P(box(0.04, 0.04, 1.0), k, { y: 3.3 }), P(sph(0.06), 0xd8a030, { y: 3.72 })];
    // le coq (vers +z) et la flèche
    parts.push(P(box(0.04, 0.32, 0.5), 0xd8a030, { y: 3.95, z: 0.05 }), P(sph(0.13, 8, 6), 0xd8a030, { y: 4.15, z: 0.25, sx: 0.3 }), P(box(0.03, 0.12, 0.08), 0xd83a2a, { y: 4.3, z: 0.25 }),
      P(box(0.04, 0.4, 0.3), 0xd8a030, { y: 4.05, z: -0.3, rx: 0.4 }), P(box(0.02, 0.02, 1.4), k, { y: 3.72 }), P(cone(0.08, 0.2, 4), k, { y: 3.72, z: 0.75, rx: Math.PI / 2 }));
    return { geo: merge(parts), h: 4.4, r: 0.2, skin: 'wood' };
  },
  cowbell() {
    const wd = 0x8a6040, parts = [P(box(0.12, 2.0, 0.12), wd, { x: 0.65, y: 1.0 }), P(box(0.12, 2.0, 0.12), wd, { x: -0.65, y: 1.0 }), P(box(1.55, 0.14, 0.16), wd, { y: 2.0 }),
      P(cyl(0.16, 0.3, 0.5, 10, 1, true), 0xc8a040, { y: 1.55 }), P(cyl(0.16, 0.16, 0.04, 10), 0xc8a040, { y: 1.8 }), P(sph(0.07, 6, 4), 0x5a4a30, { y: 1.28 }),
      P(box(0.06, 0.12, 0.06), 0xd83a2a, { y: 1.88 }), P(box(0.5, 0.3, 0.04), 0xf4ecd8, { y: 0.55, z: 0.08 })];
    return { geo: merge(parts), h: 2.1, r: 0.4, skin: 'wood' };
  },
  /** Flaque de boue (on la traverse : on en ressort tout crotté). */
  mudpuddle() {
    const parts = [P(cyl(1.4, 1.5, 0.04, 20), 0x6a4a2c, { y: 0.02 }), P(cyl(1.1, 1.1, 0.02, 18), 0x4e3620, { y: 0.045 })];
    for (let i = 0; i < 8; i++) { const a = i * 0.8; parts.push(P(sph(0.18 + (i % 3) * 0.06, 8, 6), 0x5a3c22, { x: Math.cos(a) * 1.45, y: 0.02, z: Math.sin(a) * 1.45, sy: 0.35 })); }
    return { geo: merge(parts), h: 0.1, r: 1.4, skin: 'mud' };
  },

  egg(c) { return { geo: merge([P(sph(0.26, 12, 9), c.col || 0xffd84a, { sy: 1.3 }), P(tor(0.25, 0.03, 4, 14), c.band || 0xff6a8a, { rx: Math.PI / 2 })]), h: 0.4, r: 0.3, unlit: true }; },
  apple(c) { return { geo: merge([P(sph(0.26, 12, 9), c.col || 0xffcc30, { sy: 0.92 }), P(cyl(0.02, 0.025, 0.16, 4), 0x6a4a2a, { y: 0.28 }), P(sph(0.09, 6, 4), 0x5ab040, { x: 0.08, y: 0.3, sy: 0.25, sz: 1.8 })]), h: 0.4, r: 0.3, unlit: true }; },
  sparkle() { return { geo: merge([P(new THREE.OctahedronGeometry(0.2), 0xd8f4ff, { sz: 0.4, sy: 1.3 })]), h: 0.3, r: 0.2, unlit: true }; },
  finish() {
    const parts = [P(cyl(0.06, 0.06, 3.0, 5), 0xf4f4f4, { y: 1.5 })];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) parts.push(P(box(0.02, 0.22, 0.22), (i + j) % 2 ? 0x111111 : 0xffffff, { y: 2.75 - j * 0.22, z: 0.12 + i * 0.22 }));
    return { geo: merge(parts), h: 3, r: 0.2 };
  },
};

// ---------------------------------------------------------------------------
// Objets « détaillés » (au choix d'une palette : props: { snowman: { model: 'snowmanHD' } }) :
// silhouettes plus riches, faites pour une matière « riche » (cfg.propMat, voir snowart.js) qui
// reconnaît la neige, la glace, le bois, l'or et le charbon d'après la couleur des sommets.
// ---------------------------------------------------------------------------
/** Sphère (ou autre géométrie indexée) cabossée : neige tassée à la main, congère, rocher. */
function lump(geo, amt, freq, seed) {
  const p = geo.attributes.position, s = seed || 1;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), l = Math.hypot(x, y, z) || 1;
    const n = Math.sin(x * freq + s) * Math.sin(y * freq * 1.3 + s * 2.1) * Math.sin(z * freq * 0.9 + s * 0.7) + 0.5 * Math.sin((x + z) * freq * 2.3 + s * 3.3) * Math.sin(y * freq * 2.1);
    const k = 1 + n * amt;
    p.setXYZ(i, x * k, y * k, z * k);
    void l;
  }
  geo.computeVertexNormals();
  return geo;
}
const SNOW_C = 0xf6f9ff, COAL = 0x16161a, TWIG = 0x5a3a24;
/** Bras de bonhomme : une branche et deux brindilles (origine : l'épaule, vers +x). */
function stickArm(side, len) {
  const out = [], s = side;
  out.push(P(cyl(0.022, 0.034, len, 5), TWIG, { x: s * len * 0.48, y: len * 0.18, rz: -s * 1.2 }));
  out.push(P(cyl(0.012, 0.018, len * 0.32, 4), TWIG, { x: s * len * 0.8, y: len * 0.42, rz: -s * 0.5 }));
  out.push(P(cyl(0.012, 0.018, len * 0.28, 4), TWIG, { x: s * len * 0.9, y: len * 0.22, rz: -s * 1.9 }));
  return out;
}
/** Bonhomme de neige soigné : boules tassées, charbons, carotte striée, écharpe à franges. */
function snowmanParts(r1, r2, r3, o) {
  o = o || {};
  const y1 = r1 * 0.86, y2 = y1 + r1 * 0.78 + r2 * 0.78, y3 = y2 + r2 * 0.72 + r3 * 0.8;
  const parts = [P(lump(sph(r1, 22, 16), 0.035, 7, 1), SNOW_C, { y: y1, sy: 0.92 }), P(lump(sph(r2, 20, 14), 0.035, 8, 2), SNOW_C, { y: y2, sy: 0.95 }),
    P(lump(sph(r3, 18, 12), 0.03, 9, 3), SNOW_C, { y: y3 }),
    // collerette de neige au pied
    P(lump(tor(r1 * 0.85, r1 * 0.22, 6, 18), 0.12, 6, 4), 0xeef4ff, { y: 0.06, rx: Math.PI / 2, sz: 0.6 })];
  // yeux, sourire, boutons (charbon)
  for (const sx of [-1, 1]) parts.push(P(sph(r3 * 0.12, 8, 6), COAL, { x: sx * r3 * 0.36, y: y3 + r3 * 0.22, z: r3 * 0.88, sz: 0.6 }));
  for (let i = 0; i < 5; i++) { const a = -0.55 + i * 0.275; parts.push(P(sph(r3 * 0.065, 6, 4), COAL, { x: Math.sin(a) * r3 * 0.55, y: y3 - r3 * 0.32 - Math.cos(a * 1.2) * r3 * 0.08 + r3 * 0.08, z: r3 * 0.86 })); }
  for (let i = 0; i < 3; i++) parts.push(P(sph(r2 * 0.1, 8, 6), COAL, { y: y2 + r2 * (0.4 - i * 0.38), z: r2 * (0.95 - Math.abs(0.4 - i * 0.38) * 0.2), sz: 0.6 }));
  // carotte (un peu tombante), avec ses stries
  const nose = cone(r3 * 0.17, r3 * 1.15, 10);
  parts.push(P(nose, 0xf07a1a, { y: y3 - r3 * 0.02, z: r3 * 1.45, rx: Math.PI / 2 + 0.12 }));
  for (let i = 0; i < 3; i++) parts.push(P(tor(r3 * (0.14 - i * 0.035), r3 * 0.012, 3, 10), 0xc8540e, { y: y3 - r3 * 0.02 - i * r3 * 0.03, z: r3 * (1.05 + i * 0.22), rx: 0.12 }));
  // écharpe (deux tons) et son pan à franges
  if (o.scarf !== false) {
    const sc = o.scarf || 0xd8303a, sc2 = o.scarf2 || 0xf4ece0;
    parts.push(P(tor(r3 * 0.98, r3 * 0.24, 8, 22), sc, { y: y2 + r2 * 0.68, rx: Math.PI / 2, sz: 0.85 }));
    for (let i = 0; i < 4; i++) parts.push(P(tor(r3 * 0.99, r3 * 0.07, 4, 22, Math.PI * 0.35), sc2, { y: y2 + r2 * 0.68, rx: Math.PI / 2, rz: i * 1.6 }));
    parts.push(P(box(r3 * 0.42, r2 * 0.95, r3 * 0.12), sc, { x: r3 * 0.45, y: y2 + r2 * 0.25, z: r2 * 0.82, rz: 0.15, rx: -0.25 }));
    for (let i = 0; i < 2; i++) parts.push(P(box(r3 * 0.43, r3 * 0.09, r3 * 0.13), sc2, { x: r3 * 0.43 - 0.0, y: y2 + r2 * (0.05 + i * 0.25), z: r2 * 0.84 - i * 0.02, rz: 0.15, rx: -0.25 }));
  }
  if (o.arms !== false) for (const s of [-1, 1]) for (const g of stickArm(s, r2 * 1.9)) { g.translate(s * r2 * 0.85, y2 + r2 * 0.15, 0); parts.push(g); }
  return { parts, top: y3 + r3 };
}
Object.assign(PROPS, {
  snowmanHD() { const s = snowmanParts(0.55, 0.4, 0.29); return { geo: merge(s.parts), h: 2.0, r: 0.6, shadow: true }; },
  pileHD() {
    const parts = [];
    for (const [x, z, r, sy] of [[0, 0, 0.62, 0.72], [0.48, 0.22, 0.42, 0.65], [-0.4, -0.3, 0.44, 0.75], [0.15, -0.45, 0.3, 0.6], [-0.35, 0.38, 0.28, 0.6]]) parts.push(P(lump(sph(r, 14, 10), 0.09, 6 + r * 4, x * 9 + z), SNOW_C, { x, y: 0.02, z, sy }));
    for (const [x, y, z, s, rz] of [[0.2, 0.5, 0.12, 0.09, 0.3], [-0.28, 0.42, 0.22, 0.07, -0.4], [0.5, 0.28, -0.1, 0.06, 0.8]]) parts.push(P(new THREE.OctahedronGeometry(s), 0xbfeaff, { x, y, z, sy: 1.8, rz }));
    return { geo: merge(parts), h: 0.7, r: 0.8 };
  },
  iceblockHD() {
    const parts = [];
    const b = new THREE.BoxGeometry(0.98, 0.86, 0.98, 2, 2, 2), p = b.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), k = Math.sin(x * 11 + z * 7) * 0.035 + Math.sin(y * 13 + x * 5) * 0.03; p.setXYZ(i, x * (1 + k), y + k * 0.5, z * (1 - k)); }
    const bn = b.toNonIndexed(); bn.computeVertexNormals();
    parts.push(P(bn, 0x86c8ec, { y: 0.43, ry: 0.4 }));
    // éclats de glace appuyés contre le bloc
    for (const [x, z, h, rz, rx] of [[0.55, 0.2, 0.7, -0.35, 0.1], [-0.45, 0.45, 0.5, 0.3, -0.2], [0.2, -0.58, 0.42, 0.1, 0.35]]) parts.push(P(cyl(0.001, 0.13, h, 6).toNonIndexed(), 0xa8dcf6, { x, y: h * 0.42, z, rz, rx }));
    // chapeau de neige qui déborde, et ses petits glaçons
    parts.push(P(lump(sph(0.66, 16, 8, 0, TAU, 0, Math.PI / 2), 0.08, 7, 5), SNOW_C, { y: 0.84, sy: 0.32, ry: 0.4 }));
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + 0.3, l = 0.1 + ((i * 37) % 10) / 40; parts.push(P(cone(0.03, l, 5), 0xb8e6fa, { x: Math.cos(a) * 0.6, y: 0.82 - l / 2, z: Math.sin(a) * 0.6, rx: Math.PI })); }
    return { geo: merge(parts), h: 1.0, r: 0.7, shadow: true };
  },
  driftHD(c) {
    const top = c.top || 0x8ad8ff;
    const parts = [P(lump(sph(1.4, 28, 10, 0, TAU, 0, Math.PI / 2), 0.06, 3.5, 7), SNOW_C, { sy: 0.36 }),
      P(tor(0.85, 0.1, 8, 32), top, { y: 0.42, rx: Math.PI / 2 }), P(cyl(0.78, 0.8, 0.05, 28), c.mid || 0xbfeaff, { y: 0.46 }),
      P(tor(0.42, 0.05, 6, 24), top, { y: 0.49, rx: Math.PI / 2 })];
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; parts.push(P(sph(0.075, 10, 8), c.dots || 0xff7ab0, { x: Math.cos(a) * 1.12, y: 0.27, z: Math.sin(a) * 1.12 })); }
    // mottes de neige autour
    for (let i = 0; i < 4; i++) { const a = i * 1.7 + 0.5; parts.push(P(lump(sph(0.22, 8, 6), 0.15, 9, i), SNOW_C, { x: Math.cos(a) * 1.5, y: 0.02, z: Math.sin(a) * 1.5, sy: 0.55 })); }
    return { geo: merge(parts), h: 0.5, r: 1.3 };
  },
  chestHD() {
    const W0 = 0x8a5230, W1 = 0x7a4426, G = 0xe8b83a, IRON = 0x2e2c30;
    const parts = [P(box(0.94, 0.5, 0.64), 0x3a2414, { y: 0.28 })];
    for (let i = 0; i < 3; i++) for (const sz of [-1, 1]) parts.push(P(box(1.0, 0.16, 0.05), i % 2 ? W1 : W0, { y: 0.1 + i * 0.17, z: sz * 0.33 }));
    for (let i = 0; i < 3; i++) for (const sx of [-1, 1]) parts.push(P(box(0.05, 0.16, 0.66), i % 2 ? W0 : W1, { x: sx * 0.49, y: 0.1 + i * 0.17 }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(P(box(0.08, 0.56, 0.08), IRON, { x: sx * 0.49, y: 0.28, z: sz * 0.33 }));
    for (const sx of [-0.3, 0.3]) parts.push(P(box(0.07, 0.56, 0.7), G, { x: sx, y: 0.28 }));
    parts.push(P(box(0.18, 0.2, 0.05), G, { y: 0.44, z: 0.36 }), P(cyl(0.025, 0.025, 0.02, 8), COAL, { y: 0.45, z: 0.39, rx: Math.PI / 2 }));
    return { geo: merge(parts), h: 0.6, r: 0.6, shadow: true };
  },
  lidHD() {
    const W0 = 0x8a5230, W1 = 0x7a4426, G = 0xe8b83a;
    const parts = [];
    for (let i = 0; i < 5; i++) { const a0 = i / 5 * Math.PI; parts.push(P(cyl(0.35, 0.35, 0.98, 3, 1, false, a0, Math.PI / 5), i % 2 ? W1 : W0, { y: 0, z: 0.35, rz: Math.PI / 2 })); }
    for (const sx of [-0.3, 0.3]) parts.push(P(tor(0.355, 0.035, 4, 12, Math.PI), G, { x: sx, y: 0, z: 0.35, ry: Math.PI / 2 }));
    parts.push(P(box(1.0, 0.03, 0.72), 0x3a2414, { y: 0.0, z: 0.35 }));
    // un peu de neige sur le dessus
    parts.push(P(lump(sph(0.3, 12, 6, 0, TAU, 0, Math.PI / 2), 0.1, 9, 2), SNOW_C, { y: 0.3, z: 0.35, sx: 1.4, sy: 0.25 }));
    return { geo: merge(parts), h: 0.4, r: 0.6 };
  },
  lanternHD() {
    const post = new THREE.LatheGeometry([[0.13, 0], [0.13, 0.1], [0.08, 0.18], [0.05, 0.3], [0.045, 2.05], [0.08, 2.1], [0.08, 2.15], [0, 2.16]].map(([x, y]) => new THREE.Vector2(x, y)), 8);
    const parts = [P(post, 0x23262c), P(box(0.34, 0.4, 0.34), 0xffe0a0, { y: 2.35 })];
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) parts.push(P(box(0.03, 0.44, 0.03), 0x23262c, { x: dx * 0.17, y: 2.35, z: dz * 0.17 }));
    parts.push(P(cone(0.3, 0.26, 4), 0x23262c, { y: 2.68, ry: Math.PI / 4 }), P(cone(0.28, 0.13, 4), SNOW_C, { y: 2.8, ry: Math.PI / 4 }), P(sph(0.04), 0xd8b040, { y: 2.88 }));
    return { geo: merge(parts), h: 2.9, r: 0.2 };
  },
});
VILLAGER.snowmanHD = () => merge(snowmanParts(0.6, 0.44, 0.32, { arms: false }).parts);
// les modèles du kit (parc, jardins, mares…) s'ajoutent à ceux de la neige
for (const k in KIT.MODELS) if (!MODELS[k]) MODELS[k] = KIT.MODELS[k];
for (const k in KIT.PROPS) if (!PROPS[k]) PROPS[k] = KIT.PROPS[k];
for (const k in KIT.TOOLS) if (!VILLAGER[k]) VILLAGER[k] = KIT.TOOLS[k];
/** Le petit kit de modelage de life.js, pour les mondes qui ajoutent leurs propres modèles (citylife.js). */
export const SHAPES = { P, merge, sph, cyl, cone, box, tor, eyes, wingGeo, paint, TAU };
export { VILLAGER };

function shadowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(0.55, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

/** Un maillage instancié qu'on remplit à chaque image (seulement les objets visibles). */
const WHITE = new THREE.Color(1, 1, 1);
class Layer {
  constructor(scene, geo, material, max, tint, cull) {
    this.mesh = new THREE.InstancedMesh(geo, material, Math.max(1, max));
    // cull : la couche n'est dessinée que si ses objets sont dans le champ (sphère recalculée à chaque image)
    this.mesh.frustumCulled = !!cull; this.cull = !!cull;
    this.mesh.castShadow = false; this.mesh.receiveShadow = false;
    this.mesh.userData.noOutline = true;
    this.mesh.count = 0; this.mesh.visible = false;
    this.max = Math.max(1, max); this.n = 0; this.tint = !!tint;
    if (tint) { const w = new THREE.Color(1, 1, 1); for (let i = 0; i < this.max; i++) this.mesh.setColorAt(i, w); }
    // (modèle animé — yeux, oreilles, queue, tête : lifeface.js — ou visage : une valeur de plus par instance)
    this.rig = FACE.rigged(geo);
    if (this.rig) {
      FACE.rigMaterial(material);
      const mo = new Float32Array(this.max * 4); for (let i = 0; i < this.max; i++) mo[i * 4] = 1;
      geo.setAttribute('aMood', (this.mood = new THREE.InstancedBufferAttribute(mo, 4)));
      geo.setAttribute('aHead', (this.head = new THREE.InstancedBufferAttribute(new Float32Array(this.max * 4), 4)));
    }
    if (geo.userData.face) geo.setAttribute('aTile', (this.tile = new THREE.InstancedBufferAttribute(new Float32Array(this.max), 1)));
    scene.add(this.mesh);
  }
  begin() { this.n = 0; }
  /** rig (facultatif) : { o: yeux ouverts 0..1, tail, ear, up (queue levée), hy, hp, ht (tête), tile (visage) }. */
  push(m, color, rig) {
    if (this.n >= this.max) return;
    this.mesh.setMatrixAt(this.n, m);
    if (this.tint) this.mesh.setColorAt(this.n, color || WHITE);
    if (this.rig) {
      const r = rig || NO_RIG, i = this.n * 4, a = this.mood.array, h = this.head.array;
      a[i] = r.o === undefined ? 1 : r.o; a[i + 1] = r.tail || 0; a[i + 2] = r.ear || 0; a[i + 3] = r.up || 0;
      h[i] = r.hy || 0; h[i + 1] = r.hp || 0; h[i + 2] = r.ht || 0;
    }
    if (this.tile) this.tile.array[this.n] = rig ? rig.tile || 0 : 0;
    this.n++;
  }
  end() {
    this.mesh.count = this.n; this.mesh.visible = this.n > 0;
    if (this.n) {
      this.mesh.instanceMatrix.needsUpdate = true; if (this.tint) this.mesh.instanceColor.needsUpdate = true; if (this.cull) this.mesh.computeBoundingSphere();
      if (this.rig) { this.mood.needsUpdate = true; this.head.needsUpdate = true; }
      if (this.tile) this.tile.needsUpdate = true;
    }
  }
}
const NO_RIG = {};

// ===========================================================================
// La couche de vie
// ===========================================================================
/**
 * cfg = {
 *   L,                 // les données du niveau (heightAt, iceAt, blockedAt, addColliders…)
 *   plan,              // lifeplan.planLife(…)
 *   palette: { fauna: { kind: { model, colors, ai, … } }, props: { kind: { model, act, … } } },
 *   lines: { villagerId: { who, talk: [[{who, text}]], ask, thanks } },
 *   hooks: { onDefiDone(def), onSwitch(def), onChest(def) },
 *   ground(x, z), view, active
 * }
 */
export function buildLife(game, cfg) {
  const L = cfg.L, plan = cfg.plan, pal = cfg.palette, lines = cfg.lines || {}, hooks = cfg.hooks || {};
  const sc = game.scene, lite = game.lite;
  const ground = cfg.ground || ((x, z) => L.heightAt(x, z));
  const VIEW = cfg.view || (lite ? 95 : 140), ACTIVE = cfg.active || (lite ? 60 : 85);
  const sv = () => { const s = game.save; if (!s.life) s.life = {}; const k = s.life; if (!k.defis) k.defis = []; if (!k.chests) k.chests = []; if (!k.gone) k.gone = {}; if (!k.talk) k.talk = {}; return k; };
  const sfx = () => (game.sfx && game.sfx.ok ? game.sfx : null);
  const R = Math.random;

  // surface (eau comprise) et eau : par défaut, le sol et pas d'eau
  const surface = cfg.surface || ground;
  const isWater = cfg.isWater || (() => false);
  // --- matériaux et couches -----------------------------------------------------------------
  // (cfg.grain : un léger grain sur les couleurs, plus de surfaces lisses « plastique »)
  const litMat = cfg.grain ? KIT.grainMaterial() : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82 });
  const unlitMat = new THREE.MeshBasicMaterial({ vertexColors: true });
  const wingMat = cfg.grain ? KIT.grainMaterial({ side: true }) : new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  // matières de détail facultatives (un monde peut habiller ses bêtes, habitants, objets) :
  // cfg.mats = { fauna, wing, props, fur, cloth, tool, platform }
  const mats = cfg.mats || {};
  // cfg.propMat : matière des objets (et des bonshommes habitants), par ex. la matière « riche » de snowart.js
  const propMat = cfg.propMat || mats.props || litMat;
  const glowMat = new THREE.MeshBasicMaterial({ map: M.glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const shadowMat = new THREE.MeshBasicMaterial({ map: shadowTexture(), color: 0x0a1a28, transparent: true, opacity: 0.26, depthWrite: false });
  // cfg.real : chaque modèle porte sa matière naturelle (mdl.skin : pelage, plumes, paille…), sauf si la palette en choisit une
  const skinOf = (o, mdl) => (o && o.skin ? o : cfg.real && mdl && mdl.skin ? { skin: mdl.skin } : (o || {}));
  const layers = new Map();
  const layer = (name, geo, mat, max, tint) => { if (!layers.has(name)) layers.set(name, new Layer(sc, geo, mat, max, tint, cfg.cull)); return layers.get(name); };
  // (objets à vraie matière : tex = nom d'une matière de cfg.mats — bois, métal, feuillage…)
  const matFor = (tex, dflt) => (Array.isArray(tex) ? tex.map(t => mats[t] || dflt) : (tex && mats[tex]) || dflt);
  const quad = new THREE.PlaneGeometry(1, 1);
  const glowL = layer('glow', quad, glowMat, 260, true);
  const shadowGeo = new THREE.PlaneGeometry(1, 1); shadowGeo.rotateX(-Math.PI / 2);
  const shadowL = layer('shadow', shadowGeo, shadowMat, 260, false);
  shadowL.mesh.renderOrder = 1;

  // modèles de bêtes (une couche par sorte, une pour les ailes)
  // matières : cfg.mats donne celles du monde (fauna, props, fur, cloth, hat…) ; une sorte peut avoir la sienne (palette : skin)
  const matOf = (o, cat) => (o && o.skin ? skinMaterial(o.skin, o.skinOpts) : (mats[cat] || litMat));
  const faunaModel = {};
  const countKind = (list, k) => list.filter(e => e.kind === k).reduce((a, e) => a + (e.n || (pal.fauna[k] && pal.fauna[k].group) || 1), 0);
  const defiCritters = {};
  for (const d of plan.defis) { const c = d.critter || (d.type === 'whack' ? 'marmot' : d.type === 'fish' ? 'fish' : null); if (c) defiCritters[c] = (defiCritters[c] || 0) + (d.chicks ? d.chicks.length : d.spots ? d.spots.length : d.holes ? d.holes.length : 1) + 2; }
  // les compagnons des promeneurs (un chien en laisse…) et les habitants-bêtes
  for (const e of plan.fauna) { const f = pal.fauna[e.kind]; if (f && f.line && f.young) defiCritters[f.young] = (defiCritters[f.young] || 0) + (e.n || f.group || 1) - 1; }
  for (const v of plan.villagers) { if (v.pet) defiCritters[v.pet.kind] = (defiCritters[v.pet.kind] || 0) + 1; if (v.body === 'critter' && v.model) defiCritters[v.model] = (defiCritters[v.model] || 0) + 1; }
  for (const k in pal.fauna) {
    const f = pal.fauna[k], mdl = MODELS[f.model](f.colors || {});
    const n = countKind(plan.fauna, k) + (defiCritters[k] || 0) + (f.extra || 0);
    faunaModel[k] = { f, mdl, body: layer('f_' + k, mdl.body, mdl.mat || (mdl.unlit ? unlitMat : f.shiny ? litMat : matOf(skinOf(f, mdl), 'fauna')), n + 2, !!(mdl.tint || f.tints)), flap: mdl.flap ? layer('w_' + k, mdl.flap, mdl.flapMat || mats.wing || wingMat, (n + 2) * 2, false) : null };
  }
  const propModel = {};
  const propCount = {};
  for (const p of plan.props) propCount[p.kind] = (propCount[p.kind] || 0) + 1;
  const propKinds = new Set([...Object.keys(propCount), 'marker', 'star', 'coin', 'ring', 'sparkle', 'chest', 'lid', 'hole', 'finish']);
  const extraProp = { marker: plan.defis.length, star: plan.defis.length, coin: 12, ring: 12, sparkle: 0, chest: plan.secrets.length, lid: plan.secrets.length, hole: 0, finish: 2 };
  const more = (k, n) => { propKinds.add(k); extraProp[k] = (extraProp[k] || 0) + n; };
  for (const t of plan.trails) extraProp.sparkle += t.pts.length;
  extraProp.sparkle += 40;   // paillettes qui tombent des sapins, des coffres…
  const holeKind = (f) => (typeof f.hole === 'string' ? f.hole : 'hole');
  const addExtra = (k, n) => { propKinds.add(k); extraProp[k] = (extraProp[k] || 0) + n; };
  for (const e of plan.fauna) { const f = pal.fauna[e.kind]; if (f && f.hole) addExtra(holeKind(f), 1); }
  for (const d of plan.defis) {
    if (d.holes) addExtra(d.hole || 'hole', d.holes.length);
    // objets d'un défi : ballons, bulles, frisbees… à la place des pièces rouges ou des petits perdus
    if (d.item) addExtra(d.item, (d.items || d.chicks || []).length + 1);
    if (d.jack) addExtra(d.jack, 1);
  }
  for (const d of plan.defis) if (d.type === 'volley') addExtra(d.ball || 'beachball', 1);
  for (const k in propCount) { const pk = pal.props[k] || {}; if (pk.crown) addExtra(pk.crown, propCount[k]); }
  for (const k of propKinds) {
    const pk = pal.props[k] || {};
    const mdl = PROPS[pk.model || k](pk.colors || {});
    const n = (propCount[k] || 0) + (extraProp[k] || 0);
    propModel[k] = { pk, mdl, l: layer('p_' + k, mdl.geo, mdl.mat || (mdl.unlit ? unlitMat : pk.skin ? matOf(pk, 'props') : cfg.real && mdl.skin ? matOf({ skin: mdl.skin }, 'props') : matFor(pk.tex || mdl.tex, propMat)), n + 2, k === 'hat' || !!pk.tint) };
    if (mdl.shadow) propModel[k].l.mesh.castShadow = true;
    if (mdl.depth) propModel[k].l.mesh.customDepthMaterial = mdl.depth;   // (feuillage découpé : ombre en feuilles)
  }
  // chapeaux des bonshommes (teintés)
  let hatN = 6; for (const k in propCount) if (k === 'snowman' || (pal.props[k] && pal.props[k].hatY)) hatN += propCount[k];
  const hatL = layer('p_hat', VILLAGER.hat(), mats.hat || litMat, hatN, true);
  // coiffes sauteuses d'autres objets (le heaume des armures…), pupilles des portraits
  const toppers = {};
  for (const k in propCount) { const pk = pal.props[k] || {}; if (pk.topper && !toppers[pk.topper]) toppers[pk.topper] = layer('top_' + pk.topper, VILLAGER[pk.topper](), matFor(pk.topperTex, litMat), plan.props.filter(q => (pal.props[q.kind] || {}).topper === pk.topper).length + 1, false); }
  const eyesN = plan.props.filter(q => (pal.props[q.kind] || {}).eyes).length;
  const pupilL = eyesN ? layer('p_pupil', PROPS.pupil().geo, litMat, eyesN * 2 + 2, false) : null;
  // habitants (pal.villagers : { skin, clothSkin, hatSkin } pour du vrai pelage, du vrai tissu, de la vraie paille)
  const nVill = Math.max(24, plan.villagers.length + 4);
  const vill = { body: layer('v_dog', VILLAGER.dog(), mats.fur || litMat, nVill, true), cloth: layer('v_cloth', VILLAGER.dogCloth(), mats.cloth || litMat, nVill, true), arm: layer('v_arm', VILLAGER.arm(), mats.cloth || litMat, nVill * 2, true),
    scare: layer('v_scare', VILLAGER.scarecrow(), mats.cloth || litMat, 3, false), scareArm: layer('v_scarearm', VILLAGER.scarecrowArm(), mats.cloth || litMat, 6, false),
    snow: layer('v_snow', ((cfg.villagerModels && VILLAGER[cfg.villagerModels.snowman]) || VILLAGER.snowman)(), propMat, 3, false), snowArm: layer('v_snowarm', VILLAGER.snowArm(), propMat, 6, false), yeti: layer('v_yeti', VILLAGER.yeti(), litMat, 2, false), yetiArm: layer('v_yetiarm', VILLAGER.yetiArm(), litMat, 4, false) };
  vill.face = layer('v_face', FACE.faceGeo('dog'), FACE.faceMaterial(), nVill, false);
  if (plan.villagers.some(v => v.outfit === 'summer')) vill.summer = layer('v_summer', VILLAGER.summer(), mats.cloth || litMat, nVill, true);
  if (plan.villagers.some(v => v.sunhat)) vill.sunhat = layer('v_sunhat', VILLAGER.sunhat(), mats.hat || litMat, 12, false);
  const tools = {};
  for (const v of plan.villagers) if (v.tool && !tools[v.tool]) tools[v.tool] = layer('t_' + v.tool, VILLAGER[v.tool](), mats.tool || litMat, plan.villagers.filter(q => q.tool === v.tool).length + 1, false);
  // plates-formes (nacelle du laveur de carreaux…) : le plateau, et ses câbles étirés jusqu'au toit
  const platforms = {};
  for (const v of plan.villagers) if (v.platform && !platforms[v.platform]) platforms[v.platform] = { base: layer('pl_' + v.platform, VILLAGER[v.platform](), mats.platform || litMat, 4, false), cable: layer('pc_' + v.platform, VILLAGER.cable(), mats.platform || litMat, 8, false) };
  const nCats = plan.villagers.filter(v => v.body === 'cat' && !v.ghost).length;
  if (nCats) { vill.cat = layer('v_cat', VILLAGER.cat(), mats.fur || litMat, nCats + 1, true); vill.catCloth = layer('v_catcloth', VILLAGER.catCloth(), mats.cloth || litMat, nCats + 1, true); }
  if (plan.villagers.some(v => v.ghost)) {
    const gm = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.55, roughness: 0.6, emissive: 0x9ac8ff, emissiveIntensity: 0.45, depthWrite: false });
    vill.ghost = layer('v_ghost', VILLAGER.cat(), gm, 3, false);
  }
  if (nCats || vill.ghost) vill.catFace = layer('v_catface', FACE.faceGeo('cat'), FACE.faceMaterial(), nCats + 4, false);
  const caps = {};
  for (const v of plan.villagers) if (v.cap && !caps[v.cap]) caps[v.cap] = layer('c_' + v.cap, VILLAGER[v.cap](), litMat, plan.villagers.filter(q => q.cap === v.cap).length + 1, false);
  const jballL = plan.villagers.some(v => v.act === 'juggle') ? layer('v_jball', VILLAGER.jball(), litMat, 12, true) : null;

  // --- entités -------------------------------------------------------------------------------
  const C = new THREE.Color();
  const creatures = [];
  for (const def of plan.fauna) {
    const fm = faunaModel[def.kind]; if (!fm) continue;
    const f = fm.f, n = def.n || f.group || 1;
    const flock = { def, cx: def.x, cz: def.z, t: 0, up: false, members: [] };
    for (let i = 0; i < n; i++) {
      // (une file : la maman devant, les petits derrière, en rang)
      const a = (i / n) * TAU + (def.rot || 0), rr = f.line ? i * (f.gap || 0.8) : n > 1 ? 1 + (i % 3) * 0.9 : 0;
      const x = def.x + (f.line ? -Math.sin(def.rot || 0) * rr : Math.cos(a) * rr), z = def.z + (f.line ? -Math.cos(def.rot || 0) * rr : Math.sin(a) * rr);
      const lineF = f.line && i > 0 ? (pal.fauna[f.young] || f) : f, lineM = f.line && i > 0 && f.young && faunaModel[f.young] ? faunaModel[f.young] : fm;
      const c = { def, kind: def.kind, fm: lineM, f, ff: lineF, flock: n > 1 ? flock : null, i, hx: def.x, hz: def.z, x, z, y: def.perch !== undefined ? def.perch : f.water ? surface(x, z) : ground(x, z), yaw: f.line ? (def.rot || 0) : a + 1.6, s: 'idle', t: R() * 3, ph: R() * 10,
        hop: 0, vy: 0, fly: 0, tint: f.tints ? f.tints[(i + Math.round(def.x)) % f.tints.length] : null, scale: (lineM === fm ? (f.scale || 1) : (lineF.scale || 1)) * (0.9 + ((i * 7 + Math.round(def.z)) % 5) * 0.05), petT: -9, followT: 0, under: f.ai === 'burrow' ? 1 : 0 };
      creatures.push(c); flock.members.push(c);
    }
  }
  const cGrid = new PointGrid(16);
  for (const c of creatures) cGrid.add({ x: c.hx, z: c.hz, c });
  const isPush = (k) => (pal.props[k] || {}).act === 'push';
  const r0 = (k) => (isPush(k) ? (pal.props[k].r0 || 0.5) : 0);
  const props = plan.props.map((def, i) => {
    const p = { def, i, kind: def.kind, x: def.x, y: def.y, z: def.z, yaw: def.rot || 0, wob: -9, sq: -9, broken: 0, ring: -9, r: r0(def.kind), r0: r0(def.kind), rot: 0, bx: def.x, bz: def.z, on: false, sk: 0 };
    if ((pal.props[def.kind] || {}).act === 'build') { p.stage0 = def.stage === undefined ? 0 : def.stage; p.stage = p.stage0; p.grow = -9; }
    return p;
  });
  const propById = new Map(props.map(p => [p.def.id, p]));
  const pushers = props.filter(p => p.r0);
  const pGrid = new PointGrid(16);
  for (const p of props) pGrid.add({ x: p.def.x, z: p.def.z, p });
  const villagers = plan.villagers.map((def, i) => ({ def, i, x: def.x, y: def.y, z: def.z, yaw: def.yaw || 0, ph: i * 1.7, awake: !def.sleepy, wave: -9, run: null, s: def.phase || 0, loop: def.loop ? loopOf(def.loop) : null, hold: -9 }));
  /** Un circuit fermé (promeneurs, joggeurs) : longueurs cumulées. */
  function loopOf(pts) {
    const cum = [0];
    for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; cum.push(cum[i] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    return { pts, cum, total: cum[pts.length] };
  }
  function loopAt(lp, s) {
    s = ((s % lp.total) + lp.total) % lp.total;
    let i = 0; while (i < lp.pts.length - 1 && lp.cum[i + 1] < s) i++;
    const a = lp.pts[i], b = lp.pts[(i + 1) % lp.pts.length], l = lp.cum[i + 1] - lp.cum[i] || 1, k = (s - lp.cum[i]) / l;
    return { x: a[0] + (b[0] - a[0]) * k, z: a[1] + (b[1] - a[1]) * k, yaw: Math.atan2(b[0] - a[0], b[1] - a[1]) };
  }
  const villById = new Map(villagers.map(v => [v.def.id, v]));
  const defis = plan.defis.map((def, i) => ({ def, i }));
  const chests = plan.secrets.map((def, i) => ({ def, i, open: -9 }));
  const sparkles = [];
  for (const t of plan.trails) t.pts.forEach((p, i) => sparkles.push({ id: `${t.id}_${i}`, trail: t, x: p.x, y: p.y, z: p.z, k: i }));
  const sGrid = new PointGrid(16);
  for (const s of sparkles) sGrid.add({ x: s.x, z: s.z, s });
  // obstacles des objets solides (sapins, bonshommes, habitants immobiles, coffres)
  if (L.addColliders) {
    const cols = [];
    for (const p of props) {
      const pk = pal.props[p.kind] || {};
      if (pk.box) { const q = Math.abs(Math.sin(p.yaw)) > 0.7; p.col = { type: 'box', x: p.x, z: p.z, w: q ? pk.box[1] : pk.box[0], d: q ? pk.box[0] : pk.box[1], y0: p.y - 1, y1: p.y + (propModel[p.kind].mdl.h || 1), kind: 'rock', life: p.def.id }; cols.push(p.col); }
      else if (pk.solid) cols.push({ type: 'cyl', x: p.x, z: p.z, r: pk.solid, y0: p.y - 1, y1: p.y + (propModel[p.kind].mdl.h || 1), kind: 'rock', life: p.def.id });
    }
    for (const v of villagers) if (!v.def.moves && !v.def.ghost) cols.push({ type: 'cyl', x: v.x, z: v.z, r: v.def.body === 'yeti' ? 1.0 : 0.45, y0: v.y - 1, y1: v.y + (v.def.body === 'yeti' ? 3 : 1.7), kind: 'rock', life: v.def.id });
    for (const c of chests) cols.push({ type: 'box', x: c.def.x, z: c.def.z, w: 1.0, d: 0.7, y0: c.def.y - 1, y1: c.def.y + 0.6, kind: 'rock', life: c.def.id });
    L.addColliders(cols);
  }

  // --- état partagé (l'hôte décide, les amis suivent) -------------------------------------------
  const st = { D: null, drops: [], floats: [], ev: [], seq: 0, seen: 0, near: { c: [], p: [], v: [], s: [] }, nearT: 0, barkSeen: new Map(), hudT: 0, wasDone: null,
    fdt: 0.016, barks: [], speaker: null, typing: false, loud: false, rg: {}, rgc: {}, rgf: { tile: 0 } };
  const event = (type, a, b) => { st.ev.push([++st.seq, type, a, b === undefined ? 0 : b]); if (st.ev.length > 16) st.ev.shift(); playEvent(type, a, b); };
  const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  function note(midi, inst, vol) { const s = sfx(); if (s) s.note(inst || 'bell', midi, vol || 0.12, 0, 0.5); }
  function chirp(kind) {
    const s = sfx(); if (!s) return;
    if (kind === 'chirp') { s.tone(2600 + R() * 600, 0.06, { type: 'sine', to: 3400, vol: 0.035 }); s.tone(2900, 0.05, { type: 'sine', to: 3800, vol: 0.03, delay: 0.08 }); }
    else if (kind === 'squeak') s.tone(1300 + R() * 300, 0.08, { type: 'triangle', to: 1900, vol: 0.05 });
    else if (kind === 'hoot') { s.tone(430, 0.22, { type: 'sine', to: 390, vol: 0.08 }); s.tone(400, 0.3, { type: 'sine', to: 360, vol: 0.07, delay: 0.32 }); }
    else if (kind === 'honk') s.tone(520, 0.12, { type: 'square', to: 430, vol: 0.04 });
    else if (kind === 'whistle') s.tone(2300, 0.2, { type: 'sine', to: 2700, vol: 0.05 });
    else if (kind === 'grunt') s.tone(150, 0.25, { type: 'sawtooth', to: 110, vol: 0.05 });
    else if (kind === 'ting') s.note('bell', 96 + Math.floor(R() * 5), 0.06, 0, 0.3);
    else if (kind === 'splash') s.noise(0.2, { filter: 'bandpass', freq: 1400, freqTo: 400, vol: 0.12 });
    else if (kind === 'yip') s.tone(900, 0.06, { type: 'sawtooth', to: 1300, vol: 0.06 });
    else if (kind === 'quack') { s.tone(620, 0.09, { type: 'sawtooth', to: 430, vol: 0.04 }); s.tone(600, 0.09, { type: 'sawtooth', to: 420, vol: 0.035, delay: 0.14 }); }
    else if (kind === 'peep') { s.tone(2400, 0.05, { type: 'sine', to: 2900, vol: 0.03 }); s.tone(2500, 0.05, { type: 'sine', to: 3000, vol: 0.03, delay: 0.09 }); }
    else if (kind === 'croak') { s.tone(180, 0.09, { type: 'square', to: 140, vol: 0.05 }); s.tone(170, 0.12, { type: 'square', to: 120, vol: 0.05, delay: 0.13 }); }
    else if (kind === 'coo') { s.tone(520, 0.18, { type: 'sine', to: 440, vol: 0.05 }); s.tone(480, 0.25, { type: 'sine', to: 420, vol: 0.04, delay: 0.22 }); }
    else if (kind === 'woof') { s.tone(330, 0.09, { type: 'sawtooth', to: 220, vol: 0.06 }); s.tone(320, 0.1, { type: 'sawtooth', to: 210, vol: 0.05, delay: 0.16 }); }
    else if (kind === 'sniff') s.noise(0.12, { filter: 'bandpass', freq: 2200, vol: 0.05 });
    else if (kind === 'cluck') { s.tone(880, 0.05, { type: 'square', to: 640, vol: 0.035 }); s.tone(980, 0.05, { type: 'square', to: 700, vol: 0.035, delay: 0.11 }); s.tone(1200, 0.08, { type: 'square', to: 760, vol: 0.03, delay: 0.23 }); }
    else if (kind === 'bleat') { const f = 420 + R() * 80; for (let i = 0; i < 5; i++) s.tone(f + (i % 2) * 30, 0.07, { type: 'sawtooth', to: f - 25, vol: 0.04, delay: i * 0.06 }); }
    else if (kind === 'bray') { s.tone(520, 0.35, { type: 'sawtooth', to: 760, vol: 0.05 }); s.tone(300, 0.45, { type: 'sawtooth', to: 220, vol: 0.06, delay: 0.38 }); }
    else if (kind === 'oink') { s.noise(0.14, { filter: 'bandpass', freq: 560, freqTo: 320, vol: 0.18 }); s.tone(240, 0.12, { type: 'square', to: 170, vol: 0.045 }); }
    else if (kind === 'buzz') s.tone(220, 0.4, { type: 'sawtooth', to: 240, vol: 0.02 });
    else if (kind === 'caw') { s.tone(380, 0.16, { type: 'sawtooth', to: 300, vol: 0.05 }); s.tone(370, 0.16, { type: 'sawtooth', to: 290, vol: 0.045, delay: 0.22 }); }
    else if (kind === 'meow') { s.tone(620, 0.18, { type: 'triangle', to: 980, vol: 0.05 }); s.tone(980, 0.22, { type: 'triangle', to: 560, vol: 0.045, delay: 0.17 }); }
    else if (kind === 'clank') { s.note('bell', 55 + Math.floor(R() * 4), 0.09, 0, 0.5); s.noise(0.12, { filter: 'bandpass', freq: 3200, freqTo: 1800, vol: 0.12 }); }
    else if (kind === 'flutter') s.noise(0.25, { filter: 'bandpass', freq: 900, freqTo: 1800, vol: 0.06 });
  }
  /** Rejoue un effet (chez l'hôte tout de suite, chez les amis à la réception). */
  function playEvent(type, a, b) {
    const p = props[a];
    if (type === 'pad') { if (p) p.sq = game.t; chirp('ting'); note(72 + PENTA[b % PENTA.length], 'mallet', 0.1); }
    else if (type === 'wob') { if (p) p.wob = game.t; }
    else if (type === 'ring') { if (p) p.ring = game.t; note((p && p.def.note) || 79, 'bell', 0.14); }
    else if (type === 'note') note(a, 'bell', 0.12);
    else if (type === 'chest') { const c = chests[a]; if (c) c.open = game.t; }
    else if (type === 'splash') {
      if (p) { p.sq = game.t; const col = (pal.props[p.kind] || {}).color || 0xbfe4ff; for (let i = 0; i < 14; i++) { const an = R() * TAU, sp = 1.5 + R() * 2.5; game.spawnParticle(p.x, p.y + 0.2, p.z, Math.cos(an) * sp, 3 + R() * 3, Math.sin(an) * sp, col, 0.12 + R() * 0.08, 0.7, 12); } }
      game.sound('splash'); chirp('splash');
    }
    else if (type === 'press') { if (p) { p.sq = game.t; p.on = !!b; } }
    else if (type === 'wave') { const v = villagers[a]; if (v) v.wave = game.t; }
    else if (type === 'joy') { const v = villagers[a]; if (v) { v.joyT = game.t; if (v.fx) v.fx.blushT = game.t + 2; } }
    else if (type === 'grow') { if (p) { p.stage = b; p.grow = game.t; if (b) note(67 + PENTA[b * 2 % PENTA.length], 'mallet', 0.1); } }
    else if (type === 'chirp') chirp(CHIRPS[a] || 'ting');
    else if (type === 'spin') { if (p) p.spin0 = game.t; }
  }
  const CHIRPS = ['chirp', 'squeak', 'hoot', 'honk', 'whistle', 'grunt', 'ting', 'splash', 'yip', 'quack', 'peep', 'croak', 'coo', 'woof', 'sniff', 'meow', 'clank', 'flutter', 'cluck', 'bleat', 'bray', 'oink', 'buzz', 'caw'];

  // --- paillettes (récompenses qui tombent, traînées) -------------------------------------------
  function gone(id) { const g = sv().gone[id]; if (!g) return false; if (Date.now() - g > REGROW_MS) { delete sv().gone[id]; return false; } return true; }
  function dropSparkles(x, y, z, n, value) {
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, sp = 1.5 + R() * 2;
      st.drops.push({ x, y: y + 0.3, z, vx: Math.cos(a) * sp, vy: 5 + R() * 3, vz: Math.sin(a) * sp, t: 0, v: value || 1 });
    }
    if (st.drops.length > 40) st.drops.splice(0, st.drops.length - 40);
  }
  /** Bulles de savon (machine à bulles, enfant qui souffle) : elles montent, dérivent, éclatent si on les touche. */
  function addFloat(x, y, z, vx, vz) {
    st.floats.push({ x, y, z, vx: vx || 0, vz: vz || 0, t: 0, life: 5 + R() * 3, s: 0.35 + R() * 0.45, ph: R() * TAU });
    if (st.floats.length > (lite ? 24 : 48)) st.floats.shift();
  }
  function gain(P, n, x, y, z) {
    P.score = (P.score || 0) + n;
    P.lifeChain = game.t - (P.lifeAt || -9) < 0.8 ? (P.lifeChain || 0) + 1 : 0; P.lifeAt = game.t;
    game.sound('bone', Math.min(9, P.lifeChain));
    game.burst(x, y, z, 5, 0xd8f4ff, 2.2, 0.35);
    if (game.juice) { game.juice.pop(x, y, z, 0xd8f4ff, P.lifeChain); game.jiggle(P, 0.8); game.haptic(P, 5, 70); }
  }
  function stepDrops(dt) {
    st.drops = st.drops.filter((d) => {
      d.t += dt;
      const g = ground(d.x, d.z) + 0.35;
      // aimantées vers le chien le plus proche
      const P = game.nearestPlayer(d);
      const dx = P.pos.x - d.x, dy = P.pos.y + 0.7 - d.y, dz = P.pos.z - d.z, dd = Math.hypot(dx, dy, dz);
      if (d.t > 0.45 && dd < 3.2) { const k = Math.min(1, dt * 9); d.x += dx * k; d.y += dy * k; d.z += dz * k; }
      else { d.vy -= 18 * dt; d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt; if (d.y < g) { d.y = g; d.vy = Math.abs(d.vy) * 0.35; d.vx *= 0.6; d.vz *= 0.6; } }
      if (d.t > 0.3 && dd < 1.1) { gain(P, d.v, d.x, d.y, d.z); return false; }
      return d.t < 25;
    });
  }

  // --- défis éclair -----------------------------------------------------------------------------
  const defiDone = (id) => sv().defis.includes(id);
  const KIND_NAMES = { hits: 'Touche-tout', goal: 'Dans le rond', coins: 'Les pièces rouges', rings: 'Les anneaux', race: 'La course', chase: 'Attrape-le !', pads: 'Les trampolines', whack: 'Tape-taupe', fish: 'La pêche', tag: 'Chat perché', xylo: 'La mélodie de glace', herd: 'Les petits perdus', scare: 'Ouste !', build: 'Les châteaux', volley: 'Le volley' };
  function defiTime(d) { return game.easy ? Infinity : (d.time || 45); }
  function startDefi(def, P) {
    if (st.D) return;
    const D = { def, id: def.id, t: defiTime(def), cd: def.type === 'race' ? 3 : 0, got: [], i: 0, who: P.id || 0, crit: [], phase: 'play', seqT: 0, seq: [], k: 0, last: 0 };
    if (def.type === 'race') { const p = def.path[0]; D.crit = [{ x: p[0], z: p[1], y: ground(p[0], p[1]), yaw: 0, s: 0, a: 0 }]; }
    if (def.type === 'chase') { const a = R() * TAU; D.crit = [{ x: def.x + Math.cos(a) * 6, z: def.z + Math.sin(a) * 6, y: 0, yaw: 0, a: 0 }]; }
    if (def.type === 'tag') D.crit = def.kids.map((id) => { const v = villById.get(id); return { x: v.x, z: v.z, y: v.y, yaw: 0, a: 0, id, tagged: false }; });
    if (def.type === 'herd') D.crit = def.chicks.map((ch) => {
      // [x, z] ou { x, z, y, stuck } (coincé dans un objet tant qu'on ne l'a pas secoué)
      const o = Array.isArray(ch) ? { x: ch[0], z: ch[1] } : ch;
      return { x: o.x, z: o.z, y: o.stuck ? o.y : ground(o.x, o.z), yaw: R() * TAU, a: 0, st: o.stuck ? 'stuck' : 'lost', stuck: o.stuck, who: -1 };
    });
    if (def.type === 'whack' || def.type === 'fish') {
      D.crit = def.holes.map(([x, z]) => ({ x, z, y: def.type === 'fish' ? surface(x, z) : ground(x, z), up: 0, t: 0, yaw: R() * TAU, hit: 0 }));
      D.next = 1;
    }
    if (def.type === 'goal') for (const id of def.balls) { const b = propById.get(id); if (b) { b.keep = true; if (Math.hypot(b.x - def.pen.x, b.z - def.pen.z) < def.pen.r) { b.x = b.bx; b.z = b.bz; b.y = ground(b.x, b.z); } b.vx = b.vz = 0; } }
    if (def.type === 'scare') D.crit = def.spots.map(([x, z]) => ({ x, z, y: ground(x, z), yaw: R() * TAU, a: R() * 6, st: 'sit', t: 0 }));
    if (def.type === 'xylo') { D.phase = 'show'; D.seq = def.seq.slice(); D.seqT = -0.8; D.k = 0; }
    // « touche-les tous » : les braseros s'éteignent, il faut tout rallumer
    if (def.type === 'hits') for (const id of def.props) { const p = propById.get(id); if (p && (pal.props[p.kind] || {}).act === 'light') { p.on = false; event('press', p.i, 0); } }
    if (def.type === 'build') for (const id of def.props) { const p = propById.get(id); if (p) event('grow', p.i, 0); }
    if (def.type === 'volley') { D.crit = [{ x: 0, y: 0, z: 0, yaw: 0, a: 0, vx: 0, vy: 0, vz: 0, side: 'them', t: 0, tf: 1, wait: 1.2 }]; D.miss = 0; volleyHome(D); }
    st.D = D;
    const easyNote = game.easy ? ' (Promenade : pas de chrono)' : '';
    game.banner('⚡ Défi éclair : ' + def.name, (def.hint || '') + easyNote, 3200);
    game.sound('switch');
    if (P.cheerT !== undefined) P.cheerT = 0.6;
  }
  function endDefi(win) {
    const D = st.D; if (!D) return;
    st.D = null;
    const def = D.def, P = game.party.get(D.who) || game.player;
    if (!win) { game.banner('Temps écoulé !', 'Le défi « ' + def.name + ' » attend au signal doré : on réessaie ?', 2800); game.sound('bump'); return; }
    const k = sv(), first = !k.defis.includes(def.id);
    if (first) k.defis.push(def.id);
    const sec = Math.round(((def.time || 45) - (D.t === Infinity ? 0 : D.t)) * 10) / 10;
    if (D.t !== Infinity && (!k.best || !k.best[def.id] || sec < k.best[def.id])) { k.best = k.best || {}; k.best[def.id] = sec; }
    game.persist();
    game.sound('win'); P.cheerT = 1.4;
    for (let i = 0; i < 3; i++) game.burst(P.pos.x + (i - 1), P.pos.y + 2.4, P.pos.z, 14, [0xff5a6a, 0xffd23a, 0x5ac8ff][i], 4.5, 0.8);
    if (game.juice) { game.sound('fanfare'); game.juice.confetti(P.pos.x, P.pos.y + 2.2, P.pos.z, 50, 1); game.juice.punch(0.5); game.jiggle(P, 2.4); game.haptic(P, [15, 40, 15, 40, 35], 0); }
    dropSparkles(P.pos.x, P.pos.y + 1.2, P.pos.z, first ? 10 : 4, 1);
    if (first && P.hearts !== undefined) game.spawnHeart(P.pos.x + Math.sin(P.yaw) * 1.5, P.pos.y + 1, P.pos.z + Math.cos(P.yaw) * 1.5);
    const n = k.defis.length, tot = plan.defis.length;
    if (first && n === tot) game.banner('TOUS LES DÉFIS ÉCLAIR !', cfg.allDoneText || 'Champions des défis : bravo !', 4200);
    else game.banner(first ? 'Défi réussi ! ' + n + '/' + tot : 'Encore réussi !', def.name + (D.t !== Infinity ? ' en ' + String(sec).replace('.', ',') + ' s' : ''), 3000);
    for (const v of villagers) if (v.def.defi === def.id) event('joy', v.i);   // (l'habitant saute de joie et danse)
    if (hooks.onDefiDone) hooks.onDefiDone(def, first);
  }
  const hit = (P, x, y, z, r) => (P.pos.x - x) ** 2 + (P.pos.y + 0.6 - y) ** 2 + (P.pos.z - z) ** 2 < r * r;
  const attacking = (P) => P.attackT > 0 || P.dashT > 0;
  function stepDefi(dt) {
    const D = st.D; if (!D) return;
    const def = D.def, players = game.players;
    if (D.cd > 0) { D.cd -= dt; const c = Math.ceil(D.cd); if (c !== D.last && c > 0) { D.last = c; game.banner(c + '…', '', 700); game.sound('switch'); } if (D.cd <= 0) { game.banner('Partez !', '', 900); game.sound('reveal'); } return; }
    if (D.t !== Infinity) D.t -= dt;
    if (D.t <= 0 || players.every(P => Math.hypot(P.pos.x - def.x, P.pos.z - def.z) > (def.leave || 90))) { endDefi(false); return; }
    const T = def.type;
    if (T === 'coins') {
      def.items.forEach((it, i) => {
        if (D.got.includes(i)) return;
        for (const P of players) if (hit(P, it.x, it.y, it.z, 1.6)) { D.got.push(i); P.lifeChain = D.got.length - 1; P.lifeAt = game.t; game.sound('bone', D.got.length); game.burst(it.x, it.y, it.z, 12, 0xff4a5a, 3.5, 0.5); game.localBanner(`${D.got.length}/${def.items.length}`, '', 700); break; }
      });
      if (D.got.length >= def.items.length) endDefi(true);
    } else if (T === 'rings') {
      const r = def.rings[D.i];
      for (const P of players) if (hit(P, r.x, r.y, r.z, 1.9)) { D.i++; game.sound('cp'); game.burst(r.x, r.y, r.z, 16, 0xffd23a, 4, 0.5); note(76 + PENTA[D.i % PENTA.length], 'bell'); break; }
      if (D.i >= def.rings.length) endDefi(true);
    } else if (T === 'pads') {
      if (D.got.length >= def.pads.length) endDefi(true);
    } else if (T === 'build') {
      const max = (pal.props[(propById.get(def.props[0]) || {}).kind] || {}).stages || 3;
      const n = def.props.filter(id => { const p = propById.get(id); return p && p.stage >= max; }).length;
      if (n !== D.got.length) { D.got = def.props.slice(0, n).map(() => 1); if (n) game.localBanner(`${n}/${def.props.length}`, '', 800); }
      if (n >= def.props.length) endDefi(true);
    } else if (T === 'volley') {
      const b = D.crit[0], G = 9, V = volleyFrame(def);
      if (b.wait > 0) { b.wait -= dt; volleyHome(D); if (b.wait <= 0) volleyThrow(b, V, 'us'); return; }
      b.t += dt; b.vy -= G * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.a += dt * 8;
      const g = ground(b.x, b.z);
      if (b.side === 'us') {
        for (const P of players) {
          const d = Math.hypot(P.pos.x - b.x, P.pos.z - b.z);
          if (d < 1.5 && b.y > P.pos.y - 0.4 && b.y < P.pos.y + 2.8) {
            D.got.push(1); game.sound('boing'); game.burst(b.x, b.y, b.z, 14, 0xffe070, 3.5, 0.5);
            game.localBanner(`${D.got.length}/${def.need}`, D.got.length === 1 ? 'Bien renvoyé !' : '', 700);
            volleyThrow(b, V, 'them');
            break;
          }
        }
        if (b.side === 'us' && b.y <= g + 0.2 && b.vy < 0) {
          D.miss++; game.sound('bump'); game.burst(b.x, g + 0.2, b.z, 18, 0xf0d9a4, 3, 0.6);
          game.localBanner('Raté !', 'Courez sous le ballon et sautez !', 1000); b.wait = 1.3;
        }
      } else if (b.t >= b.tf) { b.wait = 0.6; event('wave', (villById.get(def.server) || {}).i || 0); }
      if (D.got.length >= def.need) endDefi(true);
    } else if (T === 'hits') {
      if (D.got.length >= def.props.length) endDefi(true);
    } else if (T === 'goal') {
      // pousser (ou lancer d'un coup de toupie) les boules dans le rond, près du but
      const pen = def.pen;
      const inn = def.balls.filter(id => { const b = propById.get(id); return b && Math.hypot(b.x - pen.x, b.z - pen.z) < pen.r; });
      for (const id of inn) if (!D.got.includes(id)) { D.got.push(id); const b = propById.get(id); game.sound('cp'); game.burst(b.x, b.y + 0.6, b.z, 14, 0xffd23a, 3, 0.5); game.localBanner(`${D.got.length}/${def.balls.length}`, '', 800); }
      D.got = D.got.filter(id => inn.includes(id));
      if (D.got.length >= def.balls.length) { for (const id of def.balls) { const b = propById.get(id); if (b) b.keep = false; } endDefi(true); }
    } else if (T === 'race') {
      const c = D.crit[0], path = def.path, v = (def.speed || 7) * (game.easy ? 0.72 : 1);
      c.s += v * dt;
      let s = c.s, i = 0;
      while (i + 1 < path.length) { const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]); if (s <= l) break; s -= l; i++; }
      const end = path[path.length - 1];
      if (i + 1 >= path.length) { c.x = end[0]; c.z = end[1]; endDefi(false); game.banner('Il a gagné !', 'Parlez au signal doré pour une revanche', 2400); return; }
      const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, k = s / l;
      c.x = a[0] + (b[0] - a[0]) * k; c.z = a[1] + (b[1] - a[1]) * k; c.y = ground(c.x, c.z); c.yaw = Math.atan2(b[0] - a[0], b[1] - a[1]); c.a += dt * 14;
      for (const P of players) if (Math.hypot(P.pos.x - end[0], P.pos.z - end[1]) < 2.8) { endDefi(true); return; }
    } else if (T === 'chase' || T === 'tag') {
      let left = 0;
      for (const c of D.crit) {
        if (c.tagged) continue;
        left++;
        let best = null, bd = 1e9;
        for (const P of players) { const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z); if (d < bd) { bd = d; best = P; } }
        const v = (def.speed || 6.2) * (game.easy ? 0.7 : 1) * (bd < 7 ? 1 : 0.45);
        let ax = c.x - best.pos.x, az = c.z - best.pos.z; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
        // il reste dans son coin : au bord, il longe le cercle
        const ox = c.x - def.x, oz = c.z - def.z, od = Math.hypot(ox, oz);
        if (od > (def.leash || 16) * 0.75) { const tx = -oz / od, tz = ox / od, sgn = tx * ax + tz * az >= 0 ? 1 : -1; ax = ax * 0.3 + tx * sgn - ox / od * 0.6; az = az * 0.3 + tz * sgn - oz / od * 0.6; const l2 = Math.hypot(ax, az) || 1; ax /= l2; az /= l2; }
        const nx = c.x + ax * v * dt, nz = c.z + az * v * dt;
        if (!(L.blockedAt && L.blockedAt(nx, nz)) && !isWater(nx, nz)) { c.x = nx; c.z = nz; }
        // (en vol, il pique de temps en temps vers le sol : c'est le moment de sauter !)
        c.y = ground(c.x, c.z) + (def.air ? def.air * (0.55 + 0.45 * Math.sin(game.t * 1.4)) : 0); c.yaw = lerpAngle(c.yaw, Math.atan2(ax, az), Math.min(1, dt * 8)); c.a += dt * (v > 3 ? 14 : 6);
        const reach = def.air ? best.pos.y + 1.9 > c.y : Math.abs(best.pos.y - c.y) < 2;
        if (bd < (attacking(best) ? 2.2 : 1.5) + (def.air ? 0.4 : 0) && reach) {
          c.tagged = true;
          game.burst(c.x, c.y + 1, c.z, 16, 0xffffff, 4, 0.6); game.sound('poof');
          if (T === 'tag') { game.bubble({ pos: new THREE.Vector3(c.x, c.y + 1.2, c.z), small: true }, 'Touché !'); game.localBanner(`Touché ! ${D.crit.filter(q => q.tagged).length}/${D.crit.length}`, '', 900); }
          else game.bubble({ pos: new THREE.Vector3(c.x, c.y + 0.6, c.z), small: true }, 'Kaï !');
        }
      }
      if (!left) endDefi(true);
    } else if (T === 'whack' || T === 'fish') {
      D.next -= dt;
      if (D.next <= 0) {
        const free = D.crit.filter(c => c.up <= 0);
        if (free.length) { const c = free[Math.floor(R() * free.length)]; c.up = T === 'fish' ? 1.5 : (game.easy ? 2.2 : 1.4); c.t = 0; c.hit = 0; c.yaw = def.toward ? Math.atan2(def.x - c.x, def.z - c.z) + (R() - 0.5) * 0.8 : R() * TAU; if (T === 'fish') event('chirp', 7); }
        D.next = T === 'fish' ? 1.0 + R() * 0.8 : 0.6 + R() * 0.6;
      }
      for (const c of D.crit) {
        if (c.up <= 0) continue;
        c.t += dt; c.up -= dt;
        if (c.hit) continue;
        // position du poisson en l'air (un arc au-dessus du trou)
        const k = clamp(c.t / 1.5, 0, 1), fy = c.y + (T === 'fish' ? Math.sin(k * Math.PI) * 2.6 : 0.5), fx = c.x + (T === 'fish' ? Math.sin(c.yaw) * fishOff(def, k) : 0), fz = c.z + (T === 'fish' ? Math.cos(c.yaw) * fishOff(def, k) : 0);
        for (const P of players) {
          const ok = T === 'fish' ? hit(P, fx, fy, fz, 1.5) : (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < (attacking(P) ? 2.2 : 1.3) && (attacking(P) || P.vel.y < -2 || (P.barkT || 0) > 0.55)) || ((P.barkT || 0) > 0.6 && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 3.5);
          if (ok) {
            c.hit = 1; c.up = Math.min(c.up, 0.35); D.got.push(1);
            game.sound(T === 'fish' ? 'ball' : 'boing'); game.burst(fx, fy + 0.4, fz, 12, T === 'fish' ? 0x9ae0ff : 0xffe070, 3.5, 0.5);
            game.localBanner(`${D.got.length}/${def.need}`, '', 700);
            break;
          }
        }
      }
      if (D.got.length >= def.need) endDefi(true);
    } else if (T === 'xylo') {
      if (D.phase === 'show') {
        D.seqT += dt;
        const idx = Math.floor(D.seqT / 0.62);
        if (D.seqT > 0 && idx < D.seq.length && D.lastShown !== idx) { D.lastShown = idx; const p = propById.get(def.chimes[D.seq[idx]]); if (p) event('ring', p.i); }
        if (idx >= D.seq.length + 1) { D.phase = 'play'; D.k = 0; D.lastShown = -1; game.localBanner('À vous !', 'Faites sonner les glaçons dans le même ordre', 1600); }
      }
    } else if (T === 'scare') {
      // des oiseaux gourmands posés dans le champ : on les fait s'envoler (on approche, ou « Ouaf ! »)
      for (const c of D.crit) {
        if (c.st === 'gone') continue;
        if (c.st === 'fly') { c.t += dt; c.y += dt * (3 + c.t * 4); c.x += Math.sin(c.yaw) * dt * 7; c.z += Math.cos(c.yaw) * dt * 7; if (c.t > 2.5) c.st = 'gone'; continue; }
        c.a += dt;
        for (const P of players) {
          const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z);
          if (d < 1.8 || ((P.barkT || 0) > 0.55 && d < (def.hear || 7))) {
            c.st = 'fly'; c.t = 0; c.yaw = Math.atan2(c.x - P.pos.x, c.z - P.pos.z);
            event('chirp', CHIRPS.indexOf(def.sound || 'caw')); game.burst(c.x, c.y + 0.4, c.z, 10, 0x3a3a3a, 3, 0.5);
            game.localBanner(`${D.crit.filter(q => q.st !== 'sit').length}/${D.crit.length}`, '', 700);
            break;
          }
        }
      }
      if (D.crit.every(c => c.st !== 'sit')) endDefi(true);
    } else if (T === 'herd') {
      for (const c of D.crit) {
        if (c.st === 'home' || c.st === 'stuck') { c.a += dt * 3; continue; }
        if (c.st === 'lost') {
          c.a += dt * 2;
          for (const P of players) if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 1.8 && Math.abs(P.pos.y - c.y) < 2.5) { c.st = 'follow'; c.who = P.id || 0; if (def.item) game.sound('ball'); else { event('chirp', CHIRPS.indexOf((pal.fauna[def.critter] || {}).sound || 'yip')); game.bubble({ pos: new THREE.Vector3(c.x, c.y + 0.8, c.z), small: true }, def.say || 'Waf !'); } break; }
        } else {
          const P = game.party.get(c.who) || game.player;
          const idx = D.crit.filter(q => q.st === 'follow').indexOf(c);
          const back = 1.4 + idx * 1.1, tx = P.pos.x - Math.sin(P.yaw) * back, tz = P.pos.z - Math.cos(P.yaw) * back;
          const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
          if (d > 30) { c.x = tx; c.z = tz; } else if (d > 0.3) { const sp = Math.min(d * 3, 11) * dt; c.x += dx / d * sp; c.z += dz / d * sp; c.yaw = Math.atan2(dx, dz); c.a += dt * 14; }
          c.y = ground(c.x, c.z);
          const pen = def.pen;
          if (Math.hypot(c.x - pen.x, c.z - pen.z) < pen.r) { c.st = 'home'; game.sound('cp'); game.burst(c.x, c.y + 0.8, c.z, 12, 0xffd23a, 3, 0.5); game.localBanner(`${D.crit.filter(q => q.st === 'home').length}/${D.crit.length}`, '', 800); }
        }
      }
      if (D.crit.every(c => c.st === 'home')) endDefi(true);
    }
  }
  // --- volley : le filet (centre N, axe u), le côté des chiens (normale n), le lanceur ---------
  function volleyFrame(def) {
    const nt = def.net, u = { x: Math.cos(nt.yaw || 0), z: -Math.sin(nt.yaw || 0) }, n = { x: Math.sin(nt.yaw || 0), z: Math.cos(nt.yaw || 0) };
    const sv0 = villById.get(def.server);
    const S0 = sv0 ? { x: sv0.x, z: sv0.z } : { x: nt.x - n.x * 5, z: nt.z - n.z * 5 };
    return { N: nt, u, n, S: S0 };
  }
  function volleyHome(D) {
    const V = volleyFrame(D.def), b = D.crit[0];
    b.x = V.S.x + V.n.x * 0.5; b.z = V.S.z + V.n.z * 0.5; b.y = ground(b.x, b.z) + 2.0 + Math.abs(Math.sin(game.t * 5)) * 0.4; b.side = 'them';
  }
  /** Lance le ballon : vers les chiens (« us »), ou renvoyé vers le lanceur (« them »). */
  function volleyThrow(b, V, side) {
    const k = (R() - 0.5), far = R();
    const T = side === 'us'
      ? { x: V.N.x + V.n.x * (2.5 + far * 4) + V.u.x * k * 5, z: V.N.z + V.n.z * (2.5 + far * 4) + V.u.z * k * 5 }
      : { x: V.S.x + V.n.x * 0.5 + V.u.x * k * 1.5, z: V.S.z + V.n.z * 0.5 + V.u.z * k * 1.5 };
    const ty = ground(T.x, T.z) + (side === 'us' ? 0 : 1.9), G = 9;
    const tf = side === 'us' ? (game.easy ? 2.2 : 1.75) : 1.3;
    b.vx = (T.x - b.x) / tf; b.vz = (T.z - b.z) / tf; b.vy = (ty - b.y) / tf + 0.5 * G * tf;
    b.t = 0; b.tf = tf; b.side = side;
  }
  /** Le poisson saute : centré sur son trou, ou (def.toward) du trou vers la rive, sur def.reach × 2 m. */
  function fishOff(def, k) { return def.toward ? k * 2 * (def.reach || 1) : (k - 0.5) * 2; }
  /** Un glaçon sonne : la mélodie de glace avance (ou on recommence). */
  function xyloRing(p) {
    const D = st.D; if (!D || D.def.type !== 'xylo' || D.phase !== 'play') return;
    const want = D.def.chimes[D.seq[D.k]];
    if (p.def.id === want) { D.k++; if (D.k >= D.seq.length) endDefi(true); }
    else { D.phase = 'show'; D.seqT = -1.2; D.lastShown = -1; game.localBanner('Presque !', 'Écoutez encore la mélodie…', 1400); }
  }

  // --- objets : coups, aboiements, rebonds (hôte) -------------------------------------------------
  function barked(P) { const prev = st.barkSeen.get(P) || 0, b = P.barkT || 0; st.barkSeen.set(P, b); return b > prev + 0.3; }
  function stepProps(dt) {
    const players = game.players;
    const barks = players.filter(barked);
    for (const P of players) {
      if (P.ride || P.kart) continue;
      const sp = Math.hypot(P.vel.x, P.vel.z);
      for (const q of pGrid.within(P.pos.x, P.pos.z, 4.5)) {
        const p = q.p, pk = pal.props[p.kind] || {}, act = pk.act, d = Math.hypot(P.pos.x - p.x, P.pos.z - p.z), dy = P.pos.y - p.y;
        if (p.broken > game.t) continue;
        if (act === 'bounce') {
          // pk.top : hauteur de la surface qui rebondit (0,35 m : congère ; 2,4 m : toile d'un parasol)
          const r = (pk.r || 1.25), tH = pk.top === undefined ? 0.35 : pk.top, top = p.y + tH, dy2 = P.pos.y - top;
          if (d < r && dy2 < 0.65 && dy2 > (tH > 1 ? -0.4 : -0.95) && P.vel.y <= 0.5 && (P.grounded || dy2 < 0.25)) {
            P.vel.y = (pk.power || 17) * (game.easy ? 1.05 : 1); P.grounded = false; P.jumps = 1; P.coyote = 0;
            P.pos.y = Math.max(P.pos.y, top);
            const D = st.D;
            if (D && D.def.type === 'pads' && D.def.pads.includes(p.def.id) && !D.got.includes(p.def.id)) { D.got.push(p.def.id); game.localBanner(`${D.got.length}/${D.def.pads.length}`, '', 700); }
            defiTouch(p);
            P.padChain = game.t - (P.padAt || -9) < 2.2 ? (P.padChain || 0) + 1 : 0; P.padAt = game.t;
            event('pad', p.i, P.padChain);
            game.sound('boing'); game.burst(p.x, top + 0.2, p.z, 10, 0xbfeaff, 3, 0.4);
            if (P.padChain === 4 && P === game.me) game.localBanner('Rebonds en chaîne !', '', 1000);
          }
        } else if (act === 'splash') {
          // flaques, arroseurs, bains d'oiseaux : on entre dedans (ou on y retombe, ou on tape) → plouf
          const r = pk.r || propModel[p.kind].mdl.r || 1;
          const touch = d < r && dy < (pk.top || 1.4) && dy > -0.6;
          if (touch) { const fresh = !p.touching || (P.vel.y < -5 && game.t - (p.hitT || -9) > 0.5); p.touchT = game.t; p.touching = true; if (fresh) splashProp(p, P, pk); }
          else if (attacking(P) && d < r + 1.4 && Math.abs(dy) < 2) splashProp(p, P, pk);
        } else if (act === 'shake' || act === 'break' || act === 'chime' || act === 'hat' || act === 'press' || act === 'light' || act === 'slide' || act === 'spin') {
          const r = (pk.r || propModel[p.kind].mdl.r || 0.8);
          // (un carillon sonne quand on arrive contre lui, pas tant qu'on y reste collé)
          const touch = (act === 'chime' || act === 'light') && d < r + 0.9 && Math.abs(dy) < 2;
          const fresh = touch && !p.touching; if (touch) p.touchT = game.t;
          const bump = (attacking(P) && d < r + 1.8 && Math.abs(dy) < 2.5) || (sp > 5 && d < r + 0.8 && Math.abs(dy) < 1.5 && act !== 'chime') || (act === 'press' && d < r + 0.3 && dy > 0.2 && dy < 1.2 && P.vel.y <= 0) || fresh;
          if (touch) p.touching = true;
          if (bump) hitProp(p, P, pk);
        } else if (act === 'build') {
          // château de sable : un coup (Attaque) le monte d'un étage ; une charge le fait tomber
          const r = pk.r || propModel[p.kind].mdl.r || 0.9;
          if (d < r + 1.5 && Math.abs(dy) < 2) {
            if (P.dashT > 0 && p.stage >= (pk.stages || 3)) knockCastle(p, P, pk);
            else if (P.attackT > 0) buildCastle(p, P, pk);
          }
        }
      }
      for (const P2 of barks) if (P2 === P) for (const q of pGrid.within(P.pos.x, P.pos.z, 7)) { const pk = pal.props[q.p.kind] || {}; if (['shake', 'chime', 'hat', 'light', 'slide', 'spin'].includes(pk.act) && q.p.broken <= game.t) hitProp(q.p, P, pk, true); }
      // boules de neige qu'on pousse : elles roulent et grossissent
      if (P.grounded) for (const b of pushers) {
        if (b.broken > game.t || Math.abs(b.x - P.pos.x) > 4 || Math.abs(b.z - P.pos.z) > 4) continue;
        const bk = pal.props[b.kind];
        const dx = b.x - P.pos.x, dz = b.z - P.pos.z, d = Math.hypot(dx, dz);
        // (un coup de toupie ou une charge : on tire dedans, elle roule toute seule)
        if (bk.kick && attacking(P) && d < b.r + 1.6 && game.t - (b.kickT || -9) > 0.4) { b.kickT = game.t; const k = bk.kick * (0.8 + Math.min(1, sp / 8) * 0.4); b.vx = dx / (d || 1) * k; b.vz = dz / (d || 1) * k; b.moved = game.t; game.sound('ball'); continue; }
        if (d > b.r + 0.75 || sp < 1) continue;
        const nx = dx / (d || 1), nz = dz / (d || 1), push = Math.max(0, P.vel.x * nx + P.vel.z * nz);
        const tx = P.pos.x + nx * (b.r + 0.76) + nx * push * dt, tz = P.pos.z + nz * (b.r + 0.76) + nz * push * dt;
        if (L.blockedAt && L.blockedAt(tx, tz)) continue;
        if (isWater(tx, tz)) continue;
        if (Math.abs(ground(tx, tz) - ground(b.x, b.z)) > 0.5) continue;
        const moved = Math.hypot(tx - b.x, tz - b.z);
        b.x = tx; b.z = tz; b.rot += moved / b.r; b.y = ground(b.x, b.z); if (bk.grow !== false) b.r = Math.min(1.5, b.r + moved * 0.035);
        b.moved = game.t;
        if (b.r >= 1.5) {
          // trop grosse : pouf ! elle éclate en paillettes
          game.sound('poof'); game.burst(b.x, b.y + 1.2, b.z, 30, 0xffffff, 6, 0.9);
          dropSparkles(b.x, b.y + 1.2, b.z, 3, 1);
          b.broken = game.t + 20; b.x = b.bx; b.z = b.bz; b.r = 0.5; b.y = ground(b.x, b.z);
          if (P === game.me) game.localBanner('Pouf !', 'Elle était trop grosse !', 1200);
        }
      }
    }
    for (const p of props) if (p.touching && game.t - p.touchT > 0.1) p.touching = false;
    // boules lancées : elles roulent, ralentissent, rebondissent sur les obstacles
    for (const b of props) {
      if (!b.vx && !b.vz) continue;
      const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
      if ((L.blockedAt && L.blockedAt(nx, nz)) || isWater(nx, nz) || Math.abs(ground(nx, nz) - ground(b.x, b.z)) > 0.5) { b.vx *= -0.4; b.vz *= -0.4; }
      else { b.rot += Math.hypot(nx - b.x, nz - b.z) / (b.r || 1); b.x = nx; b.z = nz; b.y = ground(b.x, b.z); }
      const f = Math.max(0, 1 - dt * ((pal.props[b.kind] || {}).friction || 1.6));
      b.vx *= f; b.vz *= f; b.moved = game.t;
      if (Math.hypot(b.vx, b.vz) < 0.15) { b.vx = 0; b.vz = 0; }
    }
    // une boule abandonnée revient à sa place
    for (const p of props) if (isPush(p.kind) && p.moved && !p.keep && game.t - p.moved > 40 && game.players.every(P => Math.hypot(P.pos.x - p.x, P.pos.z - p.z) > 30)) { p.x = p.bx; p.z = p.bz; p.r = p.r0; p.y = ground(p.x, p.z); p.moved = 0; }
    // braseros : ils s'éteignent tout seuls au bout d'un moment ; bibliothèques : elles se referment
    for (const p of props) {
      const pk = pal.props[p.kind] || {};
      if (pk.act === 'light' && p.on && pk.burn && game.t - (p.litT || 0) > pk.burn && !(st.D && st.D.def.type === 'hits')) { p.on = false; event('press', p.i, 0); }
      if (pk.act === 'slide' && p.on && game.t - (p.litT || 0) > (pk.open || 30) && game.players.every(P => Math.hypot(P.pos.x - p.x, P.pos.z - p.z) > 6)) { p.on = false; event('press', p.i, 0); }
    }
  }
  /** Un objet du défi « hits » (flaques, buissons…) vient d'être touché. */
  function defiTouch(p) {
    const D = st.D;
    if (!D || D.def.type !== 'hits' || !D.def.props.includes(p.def.id) || D.got.includes(p.def.id)) return;
    D.got.push(p.def.id); game.sound('cp');
    game.burst(p.x, p.y + 1, p.z, 14, 0xffd23a, 3.5, 0.6);
    game.localBanner(`${D.got.length}/${D.def.props.length}`, '', 700);
  }
  function splashProp(p, P, pk) {
    if (game.t - (p.hitT || -9) < 0.35) return;
    p.hitT = game.t;
    event('splash', p.i);
    const id = 'p:' + p.def.id;
    if (pk.drop && !gone(id)) { sv().gone[id] = Date.now(); dropSparkles(p.x, p.y + 1, p.z, pk.drop, 1); }
    defiTouch(p);
    // une flaque de boue (pk.mud) : le niveau décide (la ferme : le chien ressort tout crotté)
    if (pk.mud && hooks.onSplash) hooks.onSplash(P, p.def);
  }
  /** Château de sable : un étage de plus (et des paillettes quand il est fini). */
  function buildCastle(p, P, pk) {
    if (game.t - (p.hitT || -9) < 0.45) return;
    p.hitT = game.t;
    const max = pk.stages || 3;
    if (p.stage >= max) { event('wob', p.i); return; }
    p.stage++;
    event('grow', p.i, p.stage);
    game.burst(p.x, p.y + 0.4 + p.stage * 0.3, p.z, 14, pk.color || 0xe8cc90, 3, 0.6);
    if (p.stage >= max) {
      game.sound('chain');
      const id = 'p:' + p.def.id;
      if (!gone(id)) { sv().gone[id] = Date.now(); dropSparkles(p.x, p.y + 1.6, p.z, pk.drop || 2, 1); }
      if (P === game.me) game.localBanner(pk.doneText || 'Un beau château !', '', 1300);
    }
  }
  function knockCastle(p, P, pk) {
    if (game.t - (p.hitT || -9) < 0.6) return;
    p.hitT = game.t; p.stage = 0;
    event('grow', p.i, 0);
    game.sound('crate'); game.burst(p.x, p.y + 0.8, p.z, 30, pk.color || 0xe8cc90, 5, 0.8);
    if (P === game.me) game.localBanner(pk.knockText || 'Patatras !', '', 1000);
  }
  function hitProp(p, P, pk, byBark) {
    const act = pk.act;
    if (game.t - (p.hitT || -9) < (act === 'chime' ? 0.35 : 0.9)) return;
    p.hitT = game.t;
    const snd = (dflt) => { const n = pk.sound || dflt; if (CHIRPS.includes(n)) event('chirp', CHIRPS.indexOf(n)); else game.sound(n); };
    defiTouch(p);
    // un objet de défi coincé dedans (le frisbee dans l'arbre…) tombe
    const D = st.D;
    if (D && D.def.type === 'herd') for (const c of D.crit) if (c.st === 'stuck' && c.stuck === p.def.id) { c.st = 'lost'; c.y = ground(c.x, c.z); game.burst(c.x, c.y + 1.5, c.z, 16, 0xffd23a, 3, 0.6); if (P === game.me) game.localBanner('Il est tombé !', 'Ramassez-le', 1200); }
    if (act === 'shake' || act === 'hat') {
      event('wob', p.i);
      game.burst(p.x, p.y + (propModel[p.kind].mdl.h || 2) * 0.8, p.z, act === 'hat' ? 10 : 22, pk.burst || pk.color || 0xffffff, 3, 0.9);
      snd(act === 'hat' ? 'boing' : 'poof');
      if (pk.gush && !byBark) st.geyser = { x: p.x, z: p.z, t: game.t + pk.gush, y: p.y + (pk.gushY || 0.5) };
      const id = 'p:' + p.def.id;
      if (pk.drop && !gone(id)) { sv().gone[id] = Date.now(); dropSparkles(p.x, p.y + 1.5, p.z, pk.drop, 1); if (P === game.me && !st.shakeTold) { st.shakeTold = true; game.localBanner('Des paillettes !', cfg.shakeText || 'Secouez les sapins, cassez les tas de neige : il y a des trésors partout', 2600); } }
    } else if (act === 'break') {
      if (byBark) return;
      p.broken = game.t + (pk.respawn || 45);
      snd('crate'); game.burst(p.x, p.y + 0.6, p.z, 26, pk.color || 0xf4f8ff, 5, 0.7);
      if (R() < (pk.chance === undefined ? 0.6 : pk.chance)) dropSparkles(p.x, p.y + 0.6, p.z, 1 + Math.floor(R() * (pk.drop || 2)), 1);
    } else if (act === 'spin') {
      event('spin', p.i); game.sound('switch');
      game.burst(p.x, p.y + (propModel[p.kind].mdl.h || 3) * 0.85, p.z, 8, pk.color || 0xffe070, 2.5, 0.5);
    } else if (act === 'chime') {
      event('ring', p.i);
      game.burst(p.x, p.y + 2.1, p.z, 6, 0xbfeaff, 2, 0.5);
      xyloRing(p);
    } else if (act === 'press') {
      p.on = !p.on;
      event('press', p.i, p.on ? 1 : 0);
      game.sound('switch');
      const t = pk.target || p.def.target;
      if (hooks.onSwitch) hooks.onSwitch(p.def, p.on, P);
      if (p.def.effect === 'geyser' || p.def.effect === 'fountain') { st.geyser = { x: p.def.gx || p.x, z: p.def.gz || p.z, t: game.t + 6, y: p.def.gy, cols: p.def.effect === 'fountain' ? [0x8ad0ff, 0xd8f4ff] : null }; if (p.def.effect === 'fountain') chirp('splash'); }
      if (p.def.effect === 'bubbles') { st.bubbles = { x: p.def.gx || p.x, z: p.def.gz || p.z, y: p.y + 1.0, t: game.t + 10 }; if (P === game.me) game.localBanner('Des bulles !', 'Attrapez-les avant qu\'elles s\'envolent', 1600); }
      if (p.def.effect === 'lights') { for (const q of props) if ((q.kind === 'lantern' || (pal.props[q.kind] || {}).lamp) && q.def.group === (p.def.group || t)) { q.on = p.on; q.litT = game.t; } }
    } else if (act === 'light') {
      if (p.on) return;
      p.on = true; p.litT = game.t;
      event('press', p.i, 1);
      game.sound('lantern'); game.burst(p.x, p.y + ((pk.lamp && pk.lamp.y) || 1.4), p.z, 16, (pk.lamp && pk.lamp.color) || 0xffb040, 3, 0.6);
    } else if (act === 'slide') {
      if (p.on) return;
      p.on = true; p.litT = game.t;
      event('press', p.i, 1);
      snd('crate'); game.burst(p.x, p.y + 1.4, p.z, 20, 0xd8c0a0, 3, 0.8);
      if (P === game.me) game.localBanner(pk.say || 'Un passage secret !', '', 1800);
    }
  }

  // --- interactions (bouton PARLER / CARESSER / DÉFI / OUVRIR) ----------------------------------
  function candidates(Q) {
    const out = [];
    for (const d of defis) if (!st.D && Math.abs(d.def.x - Q.pos.x) < 4 && Math.abs(d.def.z - Q.pos.z) < 4) out.push({ kind: 'lv', life: 'defi', i: d.i, label: defiDone(d.def.id) ? 'REJOUER' : 'DÉFI !', x: d.def.x, z: d.def.z, y: d.def.y });
    for (const v of villagers) if (v.awake && !v.run && Math.abs(v.x - Q.pos.x) < 4 && Math.abs(v.z - Q.pos.z) < 4) out.push({ kind: 'lv', life: 'talk', i: v.i, label: 'PARLER', x: v.x, z: v.z, y: v.y });
    for (const c of chests) if (!sv().chests.includes(c.def.id) && Math.abs(c.def.x - Q.pos.x) < 3.5 && Math.abs(c.def.z - Q.pos.z) < 3.5 && Math.abs(c.def.y - Q.pos.y) < 3 && !(c.def.behind && !(propById.get(c.def.behind) || {}).on)) out.push({ kind: 'lv', life: 'chest', i: c.i, label: 'OUVRIR', x: c.def.x, z: c.def.z, y: c.def.y });
    for (const q of cGrid.within(Q.pos.x, Q.pos.z, 12)) {
      const c = q.c;
      if (!c.f.pet || c.fly > 0 || c.s === 'flee' || Math.abs(c.x - Q.pos.x) > 3 || Math.abs(c.z - Q.pos.z) > 3) continue;
      out.push({ kind: 'lv', life: 'pet', ci: creatures.indexOf(c), label: 'CARESSER', x: c.x, z: c.z, y: c.y });
    }
    return out;
  }
  function interact(n, P) {
    if (n.life === 'defi') { startDefi(defis[n.i].def, P); return true; }
    if (n.life === 'chest') { openChest(chests[n.i], P); return true; }
    if (n.life === 'talk') { talk(villagers[n.i], P); return true; }
    if (n.life === 'pet') { pet(creatures[n.ci], P); return true; }
    return false;
  }
  function openChest(c, P) {
    const k = sv();
    if (k.chests.includes(c.def.id)) return;
    k.chests.push(c.def.id); game.persist();
    event('chest', c.i);
    game.sound('reveal');
    dropSparkles(c.def.x, c.def.y + 0.8, c.def.z, 8, 2);
    game.spawnHeart(c.def.x, c.def.y + 1.6, c.def.z + 0.3);
    game.burst(c.def.x, c.def.y + 1, c.def.z, 30, 0xffd23a, 5, 0.9);
    if (game.juice) { game.juice.sparkle(c.def.x, c.def.y + 1, c.def.z, 18, 0xffe680, 0.9); game.juice.confetti(c.def.x, c.def.y + 1.2, c.def.z, 30, 0.7); game.sound('sparkle', 81); game.juice.punch(0.45); game.haptic(P, [12, 40, 22], 0); }
    const n = k.chests.length, tot = plan.secrets.length;
    game.banner(`Une cachette secrète ! (${n}/${tot})`, c.def.found || 'Un coffre plein de paillettes !', 3000);
    if (hooks.onChest) hooks.onChest(c.def, P);
  }
  function pet(c, P) {
    if (!c) return;
    c.s = 'pet'; c.t = 1.4; c.petT = game.t;
    c.yaw = Math.atan2(P.pos.x - c.x, P.pos.z - c.z);
    game.burst(c.x, c.y + (c.fm.mdl.h || 1) * c.scale + 0.2, c.z, 8, 0xff8ab8, 2, 0.8);
    if (game.juice) { game.juice.hearts(c.x, c.y + (c.fm.mdl.h || 1) * c.scale + 0.3, c.z, 4); game.jiggle(P, 1.4); game.sound('petted'); game.haptic(P, [6, 60, 6], 0); }
    event('chirp', CHIRPS.indexOf(c.f.sound || 'squeak'));
    const say = c.f.say || ['♥'];
    game.bubble({ pos: new THREE.Vector3(c.x, c.y + (c.fm.mdl.h || 1) * c.scale * 0.8, c.z), small: true }, say[Math.floor(R() * say.length)]);
    const k = sv(); k.pets = (k.pets | 0) + 1;
    if (!c.gift && R() < 0.5) { c.gift = true; dropSparkles(c.x, c.y + 0.8, c.z, 1 + Math.floor(R() * 2), 1); }
    if (c.f.follow) { c.followT = c.f.follow; c.followWho = P.id || 0; }
    if (k.pets === 1) game.banner('Il est tout content !', 'Caressez les animaux : certains vous suivent, d\'autres ont un petit cadeau', 2800);
    game.persist();
  }
  function talk(v, P) {
    const def = v.def, ln = lines[def.id] || {}, k = sv();
    event('wave', v.i);
    v.hold = game.t + 8;   // (un promeneur s'arrête pour parler)
    const who = ln.who || def.name;
    const req = def.defi && plan.defis.find(d => d.id === def.defi);
    if (req && !defiDone(req.id) && ln.ask) { game.say(ln.ask, () => { k.talk[def.id + ':asked'] = 1; game.persist(); }); return; }
    if (req && defiDone(req.id) && ln.thanks && !k.talk[def.id + ':thanked']) { if (v.fx) v.fx.blushT = game.t + 6; game.say(ln.thanks, () => { k.talk[def.id + ':thanked'] = 1; dropSparkles(v.x, v.y + 1.5, v.z, 5, 1); game.persist(); }); return; }
    const list = ln.talk || [[{ who, text: '…' }]];
    const i = (k.talk[def.id] | 0) % list.length;
    k.talk[def.id] = i + 1;
    game.say(list[i]);
    void P;
  }

  // --- animation des bêtes (en local : chacun voit les siennes bouger) ----------------------------
  function threat(c) {
    let best = null, bd = 1e9;
    for (const P of game.players) { const d = Math.hypot(P.pos.x - c.x, P.pos.z - c.z); if (d < bd) { bd = d; best = P; } }
    return { P: best, d: bd };
  }
  /** Bêtes de mer (dauphins…) : f.depth = profondeur minimale sous la surface. */
  const deep = (c, x, z) => !c.f.depth || ground(x, z) < surface(x, z) - c.f.depth;
  function moveTo(c, tx, tz, v, dt) {
    const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
    if (d < 0.2) return true;
    const st2 = Math.min(d, v * dt), nx = c.x + dx / d * st2, nz = c.z + dz / d * st2;
    if ((L.blockedAt && L.blockedAt(nx, nz)) || (c.f.ai !== 'slide' && c.f.onIce === false && L.iceAt && L.iceAt(nx, nz)) || (c.f.water ? !isWater(nx, nz) || !deep(c, nx, nz) : isWater(nx, nz))) { c.t = 0; return true; }
    c.x = nx; c.z = nz;
    c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz) + (c.f.sideways ? Math.PI / 2 : 0), Math.min(1, dt * 10));
    return false;
  }
  function flee(c, P, dist, long) {
    const a = Math.atan2(c.x - P.pos.x, c.z - P.pos.z) + (R() - 0.5) * 1.2;
    const r = Math.min(c.f.home || 10, 6 + R() * 5);
    c.tx = c.x + Math.sin(a) * (long ? r * 1.3 : r); c.tz = c.z + Math.cos(a) * (long ? r * 1.3 : r);
    // (on ne s'éloigne pas trop de sa maison)
    const hd = Math.hypot(c.tx - c.hx, c.tz - c.hz), lim = (c.f.home || 10) * 1.6;
    if (hd > lim) { c.tx = c.hx + (c.tx - c.hx) / hd * lim; c.tz = c.hz + (c.tz - c.hz) / hd * lim; }
    c.s = 'flee'; c.t = 1.2 + R();
    void dist;
  }
  function stepCreature(c, dt, t, barks) {
    const f = c.f, ai = f.ai;
    c.ph += dt;
    // en file indienne (canetons derrière leur maman) : on suit celui de devant
    if (f.line && c.flock && c.i > 0) {
      const lead = c.flock.members[c.i - 1], gap = f.gap || 0.8;
      const dx = lead.x - c.x, dz = lead.z - c.z, d = Math.hypot(dx, dz);
      if (d > 14) { c.x = lead.x - Math.sin(lead.yaw) * gap; c.z = lead.z - Math.cos(lead.yaw) * gap; }
      else if (d > gap) { const sp = Math.min((d - gap) * 5, 10) * dt; c.x += dx / d * sp; c.z += dz / d * sp; c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 8)); c.hop = f.water ? 0 : Math.abs(Math.sin(c.ph * 16)) * 0.05; c.ph += dt * 2; }
      else c.hop = 0;
      c.y = f.water ? surface(c.x, c.z) + Math.sin(c.ph * 2.2) * 0.02 : ground(c.x, c.z);
      c.pitch = 0; c.flapA = lead.s === 'flee' ? Math.sin(c.ph * 30) * 0.5 : 0;
      return;
    }
    const th = threat(c);
    const barkNear = barks.some(P => Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < (f.hear || 12));
    if (ai === 'swim') {
      // canards : ils se promènent sur l'eau, s'écartent (en cancanant) si on approche ou si on aboie
      const scare = barkNear || th.d < (f.flee || 4);
      if (scare && c.s !== 'flee') {
        const a = Math.atan2(c.x - th.P.pos.x, c.z - th.P.pos.z);
        for (let k = 0; k < 8; k++) { const b = a + (R() - 0.5) * (1 + k * 0.4), r = 4 + R() * 4, tx = c.x + Math.sin(b) * r, tz = c.z + Math.cos(b) * r; if (isWater(tx, tz) && Math.hypot(tx - c.hx, tz - c.hz) < (f.home || 10) * 1.5) { c.tx = tx; c.tz = tz; break; } }
        c.s = 'flee'; c.t = 2.5; if (th.d < 30 && R() < 0.7) chirp(f.sound || 'quack');
      }
      c.t -= dt;
      if (c.s === 'flee' || c.s === 'walk') {
        const done = c.tx === undefined || moveTo(c, c.tx, c.tz, c.s === 'flee' ? (f.run || 3.5) : (f.speed || 0.8), dt);
        if (done || c.t <= 0) { c.s = 'idle'; c.t = 1.5 + R() * 3; }
      } else if (c.t <= 0) {
        for (let k = 0; k < 6; k++) { const a = R() * TAU, r = R() * (f.home || 10), tx = c.hx + Math.cos(a) * r, tz = c.hz + Math.sin(a) * r; if (isWater(tx, tz)) { c.tx = tx; c.tz = tz; c.s = 'walk'; c.t = 6 + R() * 4; break; } }
        if (c.s !== 'walk') c.t = 1;
        if (th.d < 18 && R() < 0.25) chirp(f.sound || 'quack');
      }
      c.hop = 0; c.pitch = c.s === 'idle' ? Math.max(0, Math.sin(c.ph * 0.9 + c.i * 2)) ** 8 * 1.2 : 0;   // (de temps en temps : la tête sous l'eau !)
      c.flapA = c.s === 'flee' ? Math.sin(c.ph * 28) * 0.7 : 0;
      c.y = surface(c.x, c.z) + Math.sin(c.ph * 2 + c.i) * 0.025;
      return;
    }
    if (ai === 'hop') {
      // grenouille : elle coasse (la gorge gonfle) et saute plus loin quand on approche
      if (c.j !== undefined) {
        c.j += dt / 0.55;
        const k = clamp(c.j, 0, 1);
        c.x = c.jx + (c.tx - c.jx) * k; c.z = c.jz + (c.tz - c.jz) * k;
        c.y = surface(c.x, c.z) + Math.sin(k * Math.PI) * 0.9; c.pitch = -0.6 + k * 0.9;
        if (c.j >= 1) { c.j = undefined; c.pitch = 0; if (isWater(c.x, c.z) && th.d < 30) game.burst(c.x, c.y + 0.05, c.z, 6, 0xbfe4ff, 1.5, 0.4); }
        return;
      }
      c.t -= dt; c.puff = Math.max(0, (c.puff || 0) - dt);
      const scare = barkNear || th.d < (f.flee || 3.5);
      if (c.t <= 0 || scare) {
        c.t = 2 + R() * 5;
        if (!scare && th.d < 25 && R() < 0.7) { c.puff = 0.6; chirp(f.sound || 'croak'); }
        if (scare || R() < 0.25) {
          const a = scare ? Math.atan2(c.x - th.P.pos.x, c.z - th.P.pos.z) + (R() - 0.5) : R() * TAU, r = 1.5 + R() * 2;
          let tx = c.x + Math.sin(a) * r, tz = c.z + Math.cos(a) * r;
          const hd = Math.hypot(tx - c.hx, tz - c.hz), lim = f.home || 4;
          if (hd > lim) { tx = c.hx + (tx - c.hx) / hd * lim; tz = c.hz + (tz - c.hz) / hd * lim; }
          if (!(L.blockedAt && L.blockedAt(tx, tz))) { c.jx = c.x; c.jz = c.z; c.tx = tx; c.tz = tz; c.j = 0; c.yaw = Math.atan2(tx - c.x, tz - c.z); }
        }
      }
      c.y = surface(c.x, c.z); c.hop = 0;
      return;
    }
    if (ai === 'flock') {
      const fl = c.flock;
      if (c.fly <= 0) {
        // au sol : on picore, on sautille
        const scare = barkNear || (th.d < (f.flee || 5) && Math.hypot(th.P.vel.x, th.P.vel.z) > 3.5) || th.d < 2.2;
        if (scare) {
          const a = Math.atan2(c.x - th.P.pos.x, c.z - th.P.pos.z) + (R() - 0.5);
          c.fly = 6 + R() * 4; c.vx = Math.sin(a) * 5; c.vz = Math.cos(a) * 5; c.vy = 5 + R() * 3; c.circ = R() < 0.5 ? -1 : 1;
          if (fl && !fl.up) { fl.up = true; fl.t = game.t; if (th.d < 30) chirp(f.sound || 'chirp'); for (const o of creatures) if (o.flock === fl && o.fly <= 0 && o !== c) { o.fly = 6 + R() * 4; const b = a + (R() - 0.5) * 1.5; o.vx = Math.sin(b) * 5; o.vz = Math.cos(b) * 5; o.vy = 4 + R() * 4; o.circ = c.circ; } }
          return;
        }
        if (fl) fl.up = false;
        c.t -= dt;
        if (c.t <= 0) { c.t = 0.4 + R() * 1.6; const a = R() * TAU; c.tx = c.hx + Math.cos(a) * (1 + R() * 2.5); c.tz = c.hz + Math.sin(a) * (1 + R() * 2.5); c.hop = 0; }
        if (c.tx !== undefined && !moveTo(c, c.tx, c.tz, 2.2, dt)) c.hop = Math.abs(Math.sin(c.ph * 14)) * 0.08;
        else c.hop = 0;
        c.y = ground(c.x, c.z); c.pitch = Math.max(0, Math.sin(c.ph * 6 + c.i)) * 0.5; c.flapA = 0;
      } else {
        // en vol : on tourne au-dessus de la maison, puis on se repose
        c.fly -= dt;
        const cx = c.hx, cz = c.hz, dx = c.x - cx, dz = c.z - cz, d = Math.hypot(dx, dz) || 1, R0 = 6 + (c.i % 3) * 2;
        const tx = -dz / d * c.circ, tz = dx / d * c.circ;
        c.vx += (tx * 6 - c.vx + (-dx / d) * (d - R0) * 0.6) * dt * 1.5; c.vz += (tz * 6 - c.vz + (-dz / d) * (d - R0) * 0.6) * dt * 1.5;
        const gy = ground(c.x, c.z), want = c.fly > 1.2 ? gy + (f.flyH || 6) + (c.i % 4) : gy;
        c.vy += (want - c.y) * dt * 2 - c.vy * dt;
        c.x += c.vx * dt; c.z += c.vz * dt; c.y = Math.max(gy, c.y + c.vy * dt);
        c.yaw = Math.atan2(c.vx, c.vz); c.pitch = -0.2; c.flapA = Math.sin(c.ph * 30) * 0.9;
        if (c.fly <= 0) { c.y = gy; c.fly = 0; }
      }
      return;
    }
    if (ai === 'perch' && f.lounge) {
      // chat sur un auvent, un balcon, un rebord : il somnole, suit des yeux, et bondit en feulant si on le surprend
      c.y = c.def.perch; c.flapA = 0; c.pitch = 0;
      const close = th.d < 2.6 && Math.abs(th.P.pos.y - c.y) < 2.5;
      if ((barkNear || (close && c.s !== 'pet')) && game.t - (c.startT || -9) > 2.5) {
        c.startT = game.t;
        if (th.d < 25) chirp(f.sound || 'yip');
        if (f.say && th.d < 16) game.bubble({ pos: new THREE.Vector3(c.x, c.y + (c.fm.mdl.h || 0.6) * c.scale + 0.2, c.z), small: true }, f.say[Math.floor(R() * f.say.length)]);
      }
      const s = game.t - (c.startT || -9);
      c.hop = s < 0.6 ? Math.sin(s / 0.6 * Math.PI) * 0.7 : 0;
      if (c.s === 'pet') { c.t -= dt; if (c.t <= 0) c.s = 'idle'; }
      const look = th.d < 14 ? Math.atan2(th.P.pos.x - c.x, th.P.pos.z - c.z) : (c.def.rot || 0) + Math.sin(c.ph * 0.25) * 0.5;
      c.yaw = lerpAngle(c.yaw, s < 0.6 ? look + Math.PI : look, dt * (s < 0.6 ? 10 : 1.5));
      return;
    }
    if (ai === 'perch') {
      if (c.fly <= 0) {
        c.y = c.def.perch;
        c.yaw = lerpAngle(c.yaw, th.d < 25 ? Math.atan2(th.P.pos.x - c.x, th.P.pos.z - c.z) : c.yaw + Math.sin(c.ph * 0.5) * 0.02, dt * 2);
        c.flapA = 0; c.pitch = 0; c.head = Math.sin(c.ph * 0.7) * 0.3;
        if (th.d < 22 && (c.hootT = (c.hootT || 3 + R() * 8) - dt) <= 0) { c.hootT = 8 + R() * 10; if (th.P === game.me) chirp(f.sound || 'hoot'); }
        if (barkNear || (th.d < 3 && Math.abs(th.P.pos.y - c.y) < 3)) { c.fly = 7; c.circ = R() < 0.5 ? -1 : 1; c.vx = 0; c.vz = 0; c.vy = 3; game.bubble({ pos: new THREE.Vector3(c.x, c.y + 1, c.z), small: true }, (f.say && f.say[0]) || 'Hou-hou !'); }
      } else {
        c.fly -= dt;
        const a = c.ph * 0.9 * c.circ, r = 9;
        const tx = c.hx + Math.cos(a) * r, tz = c.hz + Math.sin(a) * r, ty = c.fly > 1.5 ? c.def.perch + 4 : c.def.perch;
        const k = c.fly > 1.5 ? dt * 2 : dt * 4;
        if (c.fly <= 1.5) { c.x += (c.hx - c.x) * k; c.z += (c.hz - c.z) * k; } else { c.x += (tx - c.x) * k; c.z += (tz - c.z) * k; }
        c.y += (ty - c.y) * k * 1.5; c.yaw = Math.atan2(tx - c.x, tz - c.z); c.flapA = Math.sin(c.ph * 14) * 1.0; c.pitch = 0.1;
        if (c.fly <= 0) { c.fly = 0; c.x = c.hx; c.z = c.hz; }
      }
      return;
    }
    if (ai === 'burrow') {
      // marmotte : sort de son trou quand tout est calme, siffle et rentre si on approche
      const scared = th.d < (f.flee || 7) || barkNear;
      if (scared && c.under < 0.5 && !c.whis) { c.whis = true; if (th.d < 25) chirp('whistle'); }
      if (!scared) c.whis = false;
      c.under += ((scared ? 1 : 0) - c.under) * Math.min(1, dt * (scared ? 10 : 1.2));
      c.y = ground(c.x, c.z) - c.under * 0.95; c.yaw = lerpAngle(c.yaw, Math.atan2(th.P.pos.x - c.x, th.P.pos.z - c.z), dt * 2);
      c.head = Math.sin(c.ph * 2) * 0.15; c.hop = 0;
      return;
    }
    if (ai === 'jump') {
      // poisson : saute hors de son trou de temps en temps
      c.t -= dt;
      if (c.t <= 0 && c.j === undefined && th.d < 45) { c.j = 0; c.yaw = R() * TAU; if (th.d < 20) chirp('splash'); }
      if (c.t <= 0 && c.j === undefined) c.t = 1;
      if (c.j !== undefined) {
        c.j += dt / 1.1;
        const k = clamp(c.j, 0, 1);
        const base = f.water ? surface(c.hx, c.hz) : ground(c.hx, c.hz);
        c.x = c.hx + Math.sin(c.yaw) * (k - 0.5) * 1.6; c.z = c.hz + Math.cos(c.yaw) * (k - 0.5) * 1.6; c.y = base - 0.3 + Math.sin(k * Math.PI) * 1.8; c.pitch = (k - 0.5) * 2.2;
        if (c.j >= 1) { c.j = undefined; c.t = 2 + R() * 4; c.y = -500; if (th.d < 30) game.burst(c.hx, base + 0.1, c.hz, 6, 0x9ad8ff, 2, 0.4); }
      } else c.y = -500;
      return;
    }
    if (ai === 'hover') {
      const a = c.ph * (0.6 + (c.i % 3) * 0.2) + c.i, rg = f.range || 2.5;
      let tx = c.hx + Math.cos(a) * rg, tz = c.hz + Math.sin(a * 1.3) * rg;
      if (c.fm.flap) { c.flapA = 0.15 + Math.abs(Math.sin(c.ph * (f.flapRate || 16))) * 1.1; c.pitch = -0.3; }
      if (th.d < 3) { tx += (c.x - th.P.pos.x) * 2; tz += (c.z - th.P.pos.z) * 2; }
      if (barkNear && !c.sc) { c.sc = 1.5; }
      if (c.sc > 0) { c.sc -= dt; tx = c.hx + Math.cos(c.i * 2.4) * 6; tz = c.hz + Math.sin(c.i * 2.4) * 6; }
      const px = c.x, pz = c.z;
      c.x += (tx - c.x) * dt * 1.5; c.z += (tz - c.z) * dt * 1.5; c.y = ground(c.x, c.z) + (f.alt === undefined ? 1.2 : f.alt) + Math.sin(c.ph * 2 + c.i) * (f.bob || 0.5) + (c.sc > 0 ? 2 : 0);
      c.yaw = c.fm.flap ? Math.atan2(c.x - px, c.z - pz) : c.ph;
      if (c.fm.flap) c.flapA = Math.sin(c.ph * 26 + c.i) * 0.95;
      return;
    }
    if (ai === 'scuttle') {
      // crabe : marche de côté ; on approche → il file dans son trou (ou rentre dans sa coquille)
      const scared = th.d < (f.flee || 4) || barkNear;
      c.t -= dt;
      if (scared) {
        c.calm = 0;
        if (!c.whis && th.d < 18) { c.whis = true; if (f.say && R() < 0.4) game.bubble({ pos: new THREE.Vector3(c.x, c.y + 0.7, c.z), small: true }, f.say[Math.floor(R() * f.say.length)]); }
        if (f.hole && Math.hypot(c.hx - c.x, c.hz - c.z) > 0.3) { moveTo(c, c.hx, c.hz, f.run || 5, dt); c.hop = Math.abs(Math.sin(c.ph * 30)) * 0.03; }
        else c.under = Math.min(1, c.under + dt * (f.hole ? 4 : 6));
      } else {
        c.whis = false; c.calm = (c.calm || 0) + dt;
        if (c.calm > (f.hole ? 1.6 : 1.0)) c.under = Math.max(0, c.under - dt * 1.4);
        if (c.under < 0.05) {
          if (c.t <= 0) { const a = R() * TAU, r = R() * (f.home || 4); c.tx = c.hx + Math.cos(a) * r; c.tz = c.hz + Math.sin(a) * r; c.s = R() < 0.7 ? 'walk' : 'idle'; c.t = 1.5 + R() * 3; }
          if (c.s === 'walk' && !moveTo(c, c.tx, c.tz, f.speed || 1.2, dt)) c.hop = Math.abs(Math.sin(c.ph * 24)) * 0.025; else { c.hop = 0; c.s = 'idle'; }
        }
      }
      c.y = ground(c.x, c.z) - c.under * (f.sink || 0.6);
      c.flapA = Math.sin(c.ph * (scared ? 22 : 2.5) + c.i) * (scared ? 0.7 : 0.35);
      return;
    }
    if (ai === 'sea') {
      // dauphins, méduses : à la surface de la mer ; les dauphins sautent en arc
      const wy = surface(c.x, c.z);
      c.t -= dt;
      if (c.j !== undefined) {
        c.j += dt / (f.leapT || 1.3);
        const k = clamp(c.j, 0, 1);
        c.x += c.vx * dt; c.z += c.vz * dt;
        c.y = wy - 0.2 + Math.sin(k * Math.PI) * (f.leap || 2.4); c.pitch = (k - 0.5) * 2.2;
        if (c.j >= 1) { c.j = undefined; c.t = 2 + R() * 4; c.pitch = 0; if (th.d < 50) game.burst(c.x, wy + 0.1, c.z, 12, 0xffffff, 3, 0.5); }
      } else {
        if (c.t <= 0 || c.tx === undefined) {
          for (let k = 0; k < 6; k++) { const a = R() * TAU, r = 2 + R() * (f.home || 10); const x = c.hx + Math.cos(a) * r, z = c.hz + Math.sin(a) * r; if (isWater(x, z) && deep(c, x, z)) { c.tx = x; c.tz = z; break; } }
          c.t = 3 + R() * 4;
          if (f.leap && th.d < 80 && R() < 0.7) {
            c.j = 0; const sp = f.leapSpeed || 6; c.vx = Math.sin(c.yaw) * sp; c.vz = Math.cos(c.yaw) * sp;
            if (!isWater(c.x + c.vx * 1.4, c.z + c.vz * 1.4) || !deep(c, c.x + c.vx * 1.4, c.z + c.vz * 1.4)) { c.vx = -c.vx; c.vz = -c.vz; c.yaw += Math.PI; }
            if (th.d < 35) { chirp('splash'); game.burst(c.x, wy + 0.1, c.z, 10, 0xffffff, 3, 0.4); }
          }
        }
        if (c.j === undefined) {
          if (c.tx !== undefined) moveTo(c, c.tx, c.tz, f.speed || 1.6, dt);
          c.y = wy - (f.sub || 0.3) + Math.sin(c.ph * (f.bobF || 1.5) + c.i) * (f.bob || 0.06);
          c.pitch = Math.sin(c.ph * 1.5 + c.i) * 0.06;
        }
      }
      c.sq = f.pulse ? 1 + Math.sin(c.ph * 2.6 + c.i) * f.pulse : 1;
      c.flapA = Math.sin(c.ph * 3 + c.i) * 0.4;
      return;
    }
    if (ai === 'bask') {
      // phoque au soleil : il lève la tête, applaudit quand on le caresse (ou qu'on aboie)
      c.y = c.def.perch !== undefined ? c.def.perch : ground(c.x, c.z);
      if (barkNear && c.s !== 'pet') { c.s = 'pet'; c.t = 1.2; if (th.d < 15 && f.say) game.bubble({ pos: new THREE.Vector3(c.x, c.y + 1.2 * c.scale, c.z), small: true }, f.say[0]); }
      if (c.s === 'pet') { c.t -= dt; c.flapA = Math.sin(c.ph * 16) * 0.9; c.pitch = -0.25; c.hop = Math.abs(Math.sin(c.ph * 8)) * 0.08; if (c.t <= 0) c.s = 'idle'; return; }
      c.hop = 0; c.pitch = Math.sin(c.ph * 0.7 + c.i) * 0.06 - (th.d < 8 ? 0.15 : 0);
      c.roll = Math.sin(c.ph * 0.35 + c.i) * 0.12;
      c.flapA = Math.sin(c.ph * 1.2) * 0.15;
      if (th.d < 9) c.yaw = lerpAngle(c.yaw, Math.atan2(th.P.pos.x - c.x, th.P.pos.z - c.z), dt * 1.5);
      return;
    }
    // promeneurs (lièvre, hermine, renne, écureuil, pingouin, chiot…)
    const run = f.run || 7, walk = f.speed || 1.6;
    if (c.s === 'pet') {
      c.t -= dt; c.hop = Math.abs(Math.sin(c.ph * 12)) * 0.25; c.y = ground(c.x, c.z);
      if (c.t <= 0) c.s = 'idle';
      return;
    }
    if (c.followT > 0) {
      c.followT -= dt;
      const P = game.party.get(c.followWho) || game.player;
      const tx = P.pos.x - Math.sin(P.yaw) * 2, tz = P.pos.z - Math.cos(P.yaw) * 2, d = Math.hypot(tx - c.x, tz - c.z);
      if (d > 1) { moveTo(c, tx, tz, Math.min(10, d * 2.5), dt); c.hop = f.hopper ? Math.abs(Math.sin(c.ph * 11)) * 0.3 : 0; } else c.hop = 0;
      c.y = ground(c.x, c.z);
      if (c.followT <= 0) { c.s = 'idle'; c.t = 0; }
      return;
    }
    // les chèvres : un petit coup de tête pour jouer (seulement son propre chien, chez soi)
    if (f.butt && c.s !== 'charge' && c.s !== 'flee' && (c.buttT = (c.buttT === undefined ? 3 + R() * 4 : c.buttT) - dt) <= 0 && th.P === game.me && th.d < f.butt && th.d > 1.6 && !game.me.kart && game.me.grounded) {
      c.s = 'charge'; c.t = 1.5; c.buttT = 8 + R() * 6; chirp(f.sound || 'bleat');
      if (f.say) game.bubble({ pos: new THREE.Vector3(c.x, c.y + (c.fm.mdl.h || 1) * c.scale, c.z), small: true }, f.say[0]);
    }
    if (c.s === 'charge') {
      const P = game.me; c.t -= dt;
      const done = moveTo(c, P.pos.x, P.pos.z, f.run || 5, dt);
      c.pitch = 0.35; c.hop = Math.abs(Math.sin(c.ph * 14)) * 0.06; c.y = ground(c.x, c.z);
      if (Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 1.2 + (c.fm.mdl.r || 0.5) * c.scale * 0.6 && Math.abs(P.pos.y - c.y) < 1.5) {
        const a = Math.atan2(P.pos.x - c.x, P.pos.z - c.z);
        P.vel.x += Math.sin(a) * 8; P.vel.z += Math.cos(a) * 8; P.vel.y = Math.max(P.vel.y, 7); P.grounded = false;
        game.burst(P.pos.x, P.pos.y + 0.8, P.pos.z, 10, 0xffffff, 3, 0.5); game.sound('boing');
        if (!st.buttTold && f.buttText) { st.buttTold = true; game.localBanner(f.buttText[0], f.buttText[1], 2200); }
        c.s = 'idle'; c.t = 2; c.pitch = 0;
      } else if (c.t <= 0 || done) { c.s = 'idle'; c.t = 1.5; c.pitch = 0; }
      return;
    }
    const shy = f.shy !== false && !f.pet;
    // hérisson : il se roule en boule au lieu de fuir
    if (f.curl && c.s !== 'curl' && (barkNear || th.d < (f.flee || 3))) { c.s = 'curl'; c.t = 2.5 + R() * 2; if (th.d < 20) chirp('sniff'); }
    if (c.s === 'curl') { c.t -= dt; c.hop = 0; c.y = ground(c.x, c.z); if (c.t <= 0 && th.d > (f.flee || 3)) { c.s = 'idle'; c.t = 1; } return; }
    // chien joueur : un « Ouaf ! » et il fait la fofolle autour de vous
    if (f.playful && barkNear && c.s !== 'zoom') { c.s = 'zoom'; c.t = 2.6; c.zp = th.P; c.za = Math.atan2(c.x - th.P.pos.x, c.z - th.P.pos.z); chirp('woof'); }
    if (c.s === 'zoom') {
      c.t -= dt; c.za += dt * 3.2;
      const Pz = c.zp || th.P; moveTo(c, Pz.pos.x + Math.sin(c.za) * 3, Pz.pos.z + Math.cos(c.za) * 3, run, dt);
      c.hop = Math.abs(Math.sin(c.ph * 14)) * 0.3; c.y = ground(c.x, c.z);
      if (c.t <= 0) { c.s = 'idle'; c.t = 1; }
      return;
    }
    if (barkNear && c.s !== 'flee' && !f.playful) { flee(c, th.P, th.d, true); c.hopY = f.hopper !== false ? 0.9 : 0.3; if (th.d < 12 && R() < 0.5 && f.say) game.bubble({ pos: new THREE.Vector3(c.x, c.y + (c.fm.mdl.h || 1) * c.scale, c.z), small: true }, f.say[0]); }
    else if (shy && th.d < (f.flee || 6) && c.s !== 'flee') flee(c, th.P, th.d);
    c.t -= dt;
    if (c.s === 'flee') {
      const done = moveTo(c, c.tx, c.tz, run, dt);
      c.hop = f.hopper !== false ? Math.abs(Math.sin(c.ph * 13)) * 0.45 : Math.abs(Math.sin(c.ph * 16)) * 0.08;
      if (done || c.t <= 0) { c.s = 'idle'; c.t = 1 + R() * 2; }
    } else if (c.s === 'walk') {
      const done = moveTo(c, c.tx, c.tz, walk, dt);
      c.hop = f.hopper ? Math.abs(Math.sin(c.ph * 9)) * 0.18 : 0;
      if (ai === 'slide' && c.slide > 0) { c.slide -= dt; moveTo(c, c.tx, c.tz, 5, dt); c.hop = 0; }
      if (done || c.t <= 0) { c.s = 'idle'; c.t = 1 + R() * 3; }
    } else {
      c.hop = 0;
      c.head = Math.sin(c.ph * 1.3) * 0.4;
      if (c.t <= 0) {
        const a = R() * TAU, r = R() * (f.home || 8);
        c.tx = c.hx + Math.cos(a) * r; c.tz = c.hz + Math.sin(a) * r; c.s = 'walk'; c.t = 4 + R() * 3;
        // ronde de garde : d'un point de la ronde au suivant (on s'y arrête pour regarder autour)
        const route = c.def.route;
        if (route && route.length) { c.wp = ((c.wp === undefined ? c.i : c.wp) + 1) % route.length; c.tx = route[c.wp][0] + (c.i % 2) * 0.9; c.tz = route[c.wp][1] + (c.i % 2) * 0.6; c.t = 30; }
        if (ai === 'slide' && R() < 0.45) c.slide = 1.8;
        if (th.d < 18 && R() < 0.15) chirp(f.sound || 'squeak');
      }
    }
    c.y = ground(c.x, c.z);
  }

  // --- habitants ------------------------------------------------------------------------------------
  function stepVillager(v, dt, t) {
    const def = v.def;
    v.ph += dt;
    const me = game.me, dd = Math.hypot(me.pos.x - v.x, me.pos.z - v.z);
    const D = st.D;
    const run = D && D.def.type === 'tag' ? D.crit.find(c => c.id === def.id) : null;
    v.run = run && !run.tagged ? run : null;
    if (run) { v.x = run.x; v.z = run.z; v.y = run.y; v.yaw = run.yaw; v.act = run.tagged ? 'cheer' : 'run'; return; }
    react(v, dd, dt);
    if (v.loop) {
      // promeneurs et joggeurs : un tour du circuit (ils s'arrêtent pour parler)
      const held = v.hold > game.t;
      if (!held) v.s += (def.speed || 1.2) * dt;
      const p = loopAt(v.loop, v.s);
      v.x = p.x; v.z = p.z; v.y = ground(p.x, p.z);
      v.yaw = lerpAngle(v.yaw, held ? Math.atan2(me.pos.x - v.x, me.pos.z - v.z) : p.yaw, Math.min(1, dt * 5));
      v.act = held ? (def.actStop || 'idle') : (def.act || 'walk');
      shout(v, dd);
      if (def.pet) {
        const q = loopAt(v.loop, v.s - (def.pet.back || 1.8));
        if (v.petX === undefined || Math.hypot(q.x - v.petX, q.z - v.petZ) > 6) { v.petX = q.x; v.petZ = q.z; }
        const dx = q.x - v.petX, dz = q.z - v.petZ, d = Math.hypot(dx, dz);
        if (d > 0.1) { v.petX += dx * Math.min(1, dt * 4); v.petZ += dz * Math.min(1, dt * 4); v.petYaw = Math.atan2(dx, dz); v.petRun = Math.min(1, d * 2); } else v.petRun = 0;
        if (held) v.petYaw = lerpAngle(v.petYaw || 0, Math.atan2(me.pos.x - v.petX, me.pos.z - v.petZ), dt * 3);
      }
      return;
    }
    if (def.path === 'ellipse') {
      // patineurs : un grand tour de piste, en se balançant
      const sp = def.speed || 0.35, a = (game.t * sp + def.phase) % TAU, e = def.ellipse, sg = Math.sign(sp);
      v.x = e.x + Math.cos(a) * e.rx; v.z = e.z + Math.sin(a) * e.rz; v.y = e.y === undefined ? ground(v.x, v.z) : e.y;
      v.yaw = Math.atan2(-Math.sin(a) * e.rx * sg, Math.cos(a) * e.rz * sg);
      v.act = def.act || 'skate';
      // un marchand qui fait sa tournée : il crie de temps en temps
      if (def.cry && (v.cryT = (v.cryT === undefined ? 3 + v.i : v.cryT) - dt) <= 0) { v.cryT = 9 + (v.i % 4) * 2; if (dd < 30) game.bubble({ pos: new THREE.Vector3(v.x, v.y + 2.3, v.z), small: true }, def.cry[Math.floor(R() * def.cry.length)]); }
      return;
    }
    if (def.sleepy && !v.awake) {
      for (const P of game.players) if ((P.barkT || 0) > 0.55 && Math.hypot(P.pos.x - v.x, P.pos.z - v.z) < 8) {
        v.awake = true; v.wave = game.t; game.bubble({ pos: new THREE.Vector3(v.x, v.y + 2.6, v.z), small: true }, 'Hein ?!');
        if (v.fx) { v.fx.startT = game.t; v.fx.yawnT = game.t + 1.4; v.fx.met = true; }   // (sursaut, puis un grand bâillement)
        game.burst(v.x, v.y + 2, v.z, 20, 0xffffff, 4, 0.8);
        if (P === game.me) game.localBanner(def.name + ' s\'est réveillé !', 'Allez lui parler', 2200);
      }
    }
    if (def.lift) {
      // nacelle : on monte et on descend le long de la façade (pause en bas pour bavarder)
      const Lf = def.lift, p = ((game.t + (Lf.phase || 0)) % Lf.period) / Lf.period;
      const kk = p < 0.25 ? 0 : p < 0.45 ? (p - 0.25) / 0.2 : p < 0.8 ? 1 : 1 - (p - 0.8) / 0.2;
      v.y = Lf.y0 + (Lf.y1 - Lf.y0) * (kk * kk * (3 - 2 * kk));
    }
    v.act = def.sleepy && !v.awake ? 'sleep' : (def.actDone && def.defi && defiDone(def.defi) ? def.actDone : def.act) || 'idle';
    const home = def.yaw || 0;
    v.yaw = lerpAngle(v.yaw, (dd < 7 && v.awake && Math.abs(me.pos.y - v.y) < 3 && v.act !== 'shovel' && v.act !== 'fish' && !def.busy) || (st.speaker === v && dd < 9 && v.act !== 'lie') ? Math.atan2(me.pos.x - v.x, me.pos.z - v.z) : home, Math.min(1, dt * 3));
    shout(v, dd);
    // les musiciens jouent leur petit air quand on s'approche (doucement)
    if (def.tune && v.act !== 'play' && dd < (def.hear || 18) && (v.tuneT = (v.tuneT || 0) - dt) <= 0) {
      v.tuneK = ((v.tuneK || 0) + 1) % def.tune.length;
      const n = def.tune[v.tuneK];
      v.tuneT = def.beat || 0.45;
      if (n) { const s = sfx(); if (s) s.note(def.inst || 'pluck', n, (def.vol || 0.06) * (1 - dd / 22), 0, 0.5); }
    }
    // ronrons et petites bulles de sommeil
    if (v.act === 'sleep' && dd < 30 && R() < dt * 0.8) game.spawnParticle(v.x + (R() - 0.5) * 0.4, v.y + 1.4, v.z, 0.2, 0.5, 0, 0xffffff, 0.14, 2.0, -0.05);
    void t;
  }
  /** Les réactions d'un habitant : « ! » au premier bonjour, sursaut quand on aboie, bâillements des endormis. */
  function react(v, dd, dt) {
    const fx = v.fx, def = v.def;
    if (!fx || !v.awake || v.run) return;   // (fx : créé au premier dessin)
    const T = game.t, me = game.me, sc = def.scale || 1, head = () => new THREE.Vector3(v.x, v.y + 1.7 * sc, v.z);
    if (!fx.met && dd < 6.5 && !st.D && !game.dialog && Math.abs(me.pos.y - v.y) < 3) {
      fx.met = true; fx.surpT = T; v.wave = T + 0.9;
      game.bubble({ pos: head(), small: true }, '!');
      game.sound('pop');
    }
    for (const P of st.barks) if (Math.hypot(P.pos.x - v.x, P.pos.z - v.z) < 9 && T - (fx.startT === undefined ? -99 : fx.startT) > 2.5 && T - (fx.surpT === undefined ? -99 : fx.surpT) > 1.2) {
      fx.startT = T; fx.met = true;
      if (dd < 20) game.bubble({ pos: head(), small: true }, '!?');
    }
    // les endormis (et ceux qui se reposent) bâillent et s'étirent de temps en temps
    if ((def.sleepy || v.act === 'sit' || v.act === 'read') && dd < 40) {
      if (fx.yawnN === undefined) fx.yawnN = 6 + R() * 10;
      if ((fx.yawnN -= dt) <= 0) { fx.yawnN = (def.sleepy ? 9 : 22) + R() * 12; if (T - (fx.yawnT || -99) > 4 && st.speaker !== v) { fx.yawnT = T; if (dd < 25) game.bubble({ pos: head(), small: true }, 'Aaah…'); } }
    }
  }
  /** Les marchands crient leur marchandise (une bulle de temps en temps, quand on passe). */
  function shout(v, dd) {
    const sh = v.def.shout; if (!sh || dd > 20) return;
    if ((v.shoutT = (v.shoutT === undefined ? 1 + (v.i % 4) : v.shoutT) - 1 / 60) > 0) return;
    v.shoutT = 6 + (v.i % 3) * 2; v.shoutAt = game.t;
    game.bubble({ pos: new THREE.Vector3(v.x, v.y + 2.3 * (v.def.scale || 1), v.z), small: true }, sh[(v.shoutK = ((v.shoutK | 0) + 1)) % sh.length]);
  }

  // --- rendu ------------------------------------------------------------------------------------------
  const m4 = new THREE.Matrix4(), m5 = new THREE.Matrix4(), m6 = new THREE.Matrix4(), mB = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v4 = new THREE.Vector3(), s4 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const camQ = new THREE.Quaternion();
  const compose = (x, y, z, yaw, pitch, roll, sx, sy, sz) => m4.compose(v4.set(x, y, z), q4.setFromEuler(e4.set(pitch || 0, yaw || 0, roll || 0, 'YXZ')), s4.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz));
  function glow(x, y, z, size, color, k) {
    m5.compose(v4.set(x, y, z), camQ, s4.set(size, size, size));
    glowL.push(m5, C.setHex(color).multiplyScalar(k === undefined ? 1 : k));
  }
  function shadow(x, z, r) {
    if (lite && r < 0.35) return;
    m5.compose(v4.set(x, ground(x, z) + 0.06, z), q4.identity(), s4.set(r * 2.4, 1, r * 2.4));
    shadowL.push(m5);
  }
  /** Une bête (corps + deux ailes). */
  function drawCreature(fm, x, y, z, yaw, pitch, roll, sc, sqy, flapA, tint, noWings, rig) {
    compose(x, y, z, yaw, pitch, roll, sc, sc * (sqy || 1), sc);
    fm.body.push(m4, tint, rig);
    if (fm.flap && !noWings) {
      const pv = fm.mdl.pivots, ax = fm.mdl.flapAxis === 'z';
      for (const sd of [-1, 1]) {
        m5.copy(m4).multiply(m6.compose(v4.set(pv[0] * sd, pv[1], pv[2]), q4.setFromEuler(e4.set(0, 0, ax ? -sd * (0.15 + Math.abs(flapA || 0) * 0.6) : sd * (flapA || 0), 'XYZ')), s4.set(sd, 1, 1)));
        fm.flap.push(m5);
      }
    }
  }
  const furTint = new THREE.Color();
  // (gestes « libres » : on peut agiter les bras en parlant ; postures au repos : on se balance)
  const FIXED_ACTS = new Set(['sit', 'lie', 'fish', 'sleep', 'dig', 'skate', 'run', 'jog', 'lute', 'trumpet', 'drum', 'strum', 'play', 'kite', 'balloons', 'look']);
  const IDLE_ACTS = new Set(['idle', 'look', 'guard', 'serve', 'walk', 'call', 'sad']);
  const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const mHd = new THREE.Matrix4(), mHt = new THREE.Matrix4(), eHd = new THREE.Euler();
  /** La matrice de la tête : celle du corps, tournée autour du cou (comme le fait le nuanceur — lifeface.js). */
  function headMat(body, N, r) {
    mHd.copy(body).multiply(mHt.makeTranslation(N[0], N[1], N[2]));
    mHd.multiply(mHt.makeRotationFromEuler(eHd.set(r.hp || 0, r.hy || 0, r.ht || 0, 'YXZ')));
    return mHd.multiply(mHt.makeTranslation(-N[0], -N[1], -N[2]));
  }
  function drawVillager(v, t) {
    const def = v.def, act = v.act, ph = v.ph;
    let bob = 0, lean = 0, armR = 0, armL = 0, armRz = 0, armLz = 0, toolOn = true, sy = 1;
    const waving = game.t - v.wave < 1.6;
    if (act === 'shovel') { const k = Math.sin(ph * 3); lean = 0.25 + k * 0.15; armR = -0.6 + k * 0.5; armL = -0.6 + k * 0.5; bob = Math.abs(k) * 0.03; if (k > 0.97 && (v.puffT = (v.puffT || 0) - 1) < 0 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 40) { v.puffT = 1; game.spawnParticle(v.x + Math.sin(v.yaw + 0.8) * 1.2, v.y + 0.8, v.z + Math.cos(v.yaw + 0.8) * 1.2, Math.sin(v.yaw + 1.2) * 2, 3, Math.cos(v.yaw + 1.2) * 2, 0xffffff, 0.35, 0.8, 8); } }
    else if (act === 'fish') { armR = -1.1 + Math.sin(ph * 1.5) * 0.08; armL = -0.9; sy = 0.82; bob = -0.25; if ((v.fishT = (v.fishT === undefined ? 4 + (v.i % 5) : v.fishT) - 1 / 60) < 0) { v.fishT = 6 + (v.i % 4) * 2; v.wave = game.t; } }
    else if (act === 'skate') { const k = Math.sin(ph * 2.2); lean = 0.15; armR = -0.4 + k * 0.6; armL = -0.4 - k * 0.6; bob = Math.abs(k) * 0.06; armRz = 0.5; }
    else if (act === 'run') { const k = Math.sin(ph * 14); armR = k * 0.9; armL = -k * 0.9; bob = Math.abs(k) * 0.12; lean = 0.2; toolOn = false; }
    else if (act === 'throw') {
      const k = (ph * 0.8) % 2; armR = k < 0.3 ? -2.6 * (k / 0.3) : k < 0.5 ? -2.6 + (k - 0.3) * 13 : 0; armL = -0.3;
      // la boule part (une vraie petite boule de neige qui vole)
      if (k >= 0.4 && (v.lastK === undefined || v.lastK < 0.4) && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 45) game.spawnParticle(v.x + Math.sin(v.yaw) * 0.4, v.y + 1.3 * (def.scale || 1), v.z + Math.cos(v.yaw) * 0.4, Math.sin(v.yaw) * (def.throwV || 7), 4.5, Math.cos(v.yaw) * (def.throwV || 7), def.ball || 0xffffff, def.ballSize || 0.32, 1.1, 9);
      v.lastK = k;
    }
    else if (act === 'water') { armR = -1.25 + Math.sin(ph * 1.3) * 0.1; armL = -0.3; lean = 0.1; if (R() < 0.25 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 30) game.spawnParticle(v.x + Math.sin(v.yaw) * 1.05, v.y + 0.55, v.z + Math.cos(v.yaw) * 1.05, Math.sin(v.yaw) * 0.6, -0.5, Math.cos(v.yaw) * 0.6, 0x8ad0ff, 0.09, 0.5, 9); }
    else if (act === 'scatter') {
      const k = (ph * 0.9) % 2; armR = k < 0.5 ? -1.5 * (k / 0.5) : k < 0.8 ? -1.5 + (k - 0.5) * 4.5 : -0.15; armL = -0.9;
      if (k >= 0.55 && (v.lastK === undefined || v.lastK < 0.55) && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 35) for (let i = 0; i < 6; i++) game.spawnParticle(v.x + Math.sin(v.yaw) * 0.5, v.y + 1.1, v.z + Math.cos(v.yaw) * 0.5, Math.sin(v.yaw + (R() - 0.5)) * 3, 2 + R() * 1.5, Math.cos(v.yaw + (R() - 0.5)) * 3, def.throwColor || 0xf0d070, 0.1, 1.0, 9);
      v.lastK = k;
    }
    else if (act === 'chisel') { const k = Math.sin(ph * 7); armR = -1.0 + k * 0.4; armL = -1.2; lean = 0.2; }
    else if (act === 'stir') { armR = -1.1; armRz = Math.sin(ph * 3) * 0.3; armL = -0.5; }
    else if (act === 'flag') { armR = -2.5 + Math.sin(ph * 2) * 0.3; armL = -0.2; }
    else if (act === 'cheer') { armR = -2.8; armL = -2.8; bob = Math.abs(Math.sin(ph * 8)) * 0.3; toolOn = false; }
    // gestes des gens du château
    else if (act === 'juggle') { const k = Math.sin(ph * 6); armR = -1.3 + k * 0.35; armL = -1.3 - k * 0.35; bob = Math.abs(Math.sin(ph * 3)) * 0.05; }
    else if (act === 'lute') { armR = -0.9 + Math.sin(ph * 16) * 0.12; armL = -1.5; armRz = 0.25; bob = Math.abs(Math.sin(ph * 4)) * 0.03; }
    else if (act === 'drum') { const k = Math.sin(ph * 9); armR = -0.9 + k * 0.45; armL = -0.9 - k * 0.45; bob = Math.abs(k) * 0.02; }
    else if (act === 'conduct') { armR = -1.9 + Math.sin(ph * 4.5) * 0.5; armRz = Math.cos(ph * 4.5) * 0.35; armL = -1.4 + Math.sin(ph * 2.25) * 0.3; lean = Math.sin(ph * 2.25) * 0.05; }
    else if (act === 'trumpet') { armR = -1.45; armL = -1.3; bob = Math.abs(Math.sin(ph * 4)) * 0.04; lean = -0.12; }
    else if (act === 'sweep') { const k = Math.sin(ph * 3.2); armR = -0.5 + k * 0.25; armL = -0.6 + k * 0.25; armRz = k * 0.3; lean = 0.18; }
    else if (act === 'water') { armR = -1.0 + Math.sin(ph * 1.2) * 0.1; armL = -0.2; lean = 0.12; if (R() < 0.15 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 30) game.spawnParticle(v.x + Math.sin(v.yaw) * 0.9, v.y + 0.7, v.z + Math.cos(v.yaw) * 0.9, Math.sin(v.yaw) * 0.6, -0.5, Math.cos(v.yaw) * 0.6, 0x9ad8ff, 0.08, 0.5, 9); }
    else if (act === 'spar') { const k = (ph * 1.4) % 2; armR = k < 0.25 ? -2.4 * (k / 0.25) : k < 0.45 ? -2.4 + (k - 0.25) * 12 : 0; armL = -0.5; lean = k > 0.25 && k < 0.5 ? 0.25 : 0.05; }
    else if (act === 'paint') { armR = -1.25 + Math.sin(ph * 5) * 0.2; armRz = Math.sin(ph * 2.5) * 0.25; armL = -0.8; }
    else if (act === 'read') { armR = -1.0; armL = -1.0; armRz = -0.35; lean = 0.12; bob = Math.sin(ph * 1.5) * 0.01; }
    else if (act === 'guard') { armR = -0.25; armL = Math.sin(ph * 0.8) * 0.06; }
    else if (act === 'pole') { armR = -1.7 + Math.sin(ph * 1.6) * 0.15; armL = -0.2; }
    else if (act === 'sleep') { armR = 0.15; armL = 0.15; sy = 0.62 + Math.sin(ph * 1.6) * 0.03; bob = -0.05; toolOn = false; }
    else if (act === 'walk') { const k = Math.sin(ph * 7); armR = def.tool ? -1.2 : k * 0.5; armL = -k * 0.5; bob = Math.abs(k) * 0.04; }
    else if (act === 'jog') { const k = Math.sin(ph * 11); armR = -0.7 + k * 0.9; armL = -0.7 - k * 0.9; bob = Math.abs(k) * 0.1; lean = 0.15; }
    else if (act === 'kite') { armR = -2.55 + Math.sin(ph * 1.3) * 0.15; armRz = 0.15 + Math.sin(ph * 0.9) * 0.1; armL = -0.4; }
    else if (act === 'balloons') { armR = -2.75 + Math.sin(ph * 1.1) * 0.06; armL = -0.2; }
    else if (act === 'sit') { sy = 0.68; bob = -0.32; armR = -0.8 + Math.max(0, Math.sin(ph * 1.6)) * 0.6; armL = -0.5; }
    else if (act === 'sad') { armR = -2.0 + Math.sin(ph * 6) * 0.08; armL = -2.0 - Math.sin(ph * 6) * 0.08; sy = 0.96; toolOn = false; }
    else if (act === 'look') { armR = -1.65; armL = -1.65; armRz = -0.1; bob = Math.sin(ph * 0.6) * 0.02; }
    else if (act === 'scoop') { armR = -1.2 + Math.sin(ph * 2.5) * 0.35; armL = -0.5; lean = 0.1; }
    else if (act === 'feed' || act === 'blow') {
      const k = (ph * 0.7) % 2; armR = act === 'blow' ? -1.6 + Math.sin(ph * 1.5) * 0.3 : k < 0.3 ? -1.6 * (k / 0.3) : k < 0.5 ? -1.6 + (k - 0.3) * 8 : 0; armL = -0.5;
      const near = Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 40;
      if (act === 'feed' && k >= 0.42 && (v.lastK === undefined || v.lastK < 0.42) && near) for (let i = 0; i < 5; i++) game.spawnParticle(v.x + Math.sin(v.yaw) * 0.5, v.y + 1.2, v.z + Math.cos(v.yaw) * 0.5, Math.sin(v.yaw + (R() - 0.5)) * 3, 2.5, Math.cos(v.yaw + (R() - 0.5)) * 3, 0xe0c080, 0.07, 0.8, 9);
      if (act === 'blow' && near && R() < (lite ? 1.2 : 2.2) / 60) addFloat(v.x + Math.sin(v.yaw) * 0.7, v.y + 1.5 * (def.scale || 1), v.z + Math.cos(v.yaw) * 0.7, Math.sin(v.yaw) * 1.2, Math.cos(v.yaw) * 1.2);
      v.lastK = k;
    }
    else if (act === 'play') {
      const k = Math.sin(ph * 3); armR = -1.3; armL = -1.3; armRz = 0.35 + k * 0.25; bob = Math.abs(Math.sin(ph * 3)) * 0.03;
      const d = Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z), beat = Math.floor(ph * 2.6);
      if (beat !== v.beat) { v.beat = beat; if (d < 18 && !st.D) { const tune = def.tune || [67, 71, 74, 71, 72, 76, 74, 72, 71, 74, 79, 74, 72, 69, 67, 67]; const s = sfx(); if (s) s.note('mallet', tune[beat % tune.length], 0.05 * (1 - d / 18)); } if (d < 30 && beat % 2 === 0) game.spawnParticle(v.x, v.y + 2.1, v.z, (R() - 0.5) * 0.6, 1.2, (R() - 0.5) * 0.6, [0xffd23a, 0xff6ab0, 0x5ac8ff][beat % 3], 0.16, 1.4, -0.3); }
    }
    else if (act === 'rake') { const k = Math.sin(ph * 2.4); lean = 0.2; armR = -0.7 + k * 0.4; armL = -0.7 + k * 0.4; }
    else if (act === 'jumpy') {
      const k = Math.abs(Math.sin(ph * 4.5)); bob = k * 0.55; armR = -2.0 * k; armL = -2.0 * k; sy = 1 - (1 - k) * 0.08;
      if (def.splash && k < 0.08 && game.t - (v.splT || 0) > 0.4 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 35) { v.splT = game.t; for (let i = 0; i < 8; i++) { const a = R() * TAU; game.spawnParticle(v.x + Math.cos(a) * 0.4, v.y + 0.1, v.z + Math.sin(a) * 0.4, Math.cos(a) * 2, 2.5 + R() * 2, Math.sin(a) * 2, 0xbfe4ff, 0.1, 0.6, 12); } }
    }
    // --- activités de plage ---
    else if (act === 'dig') {
      // accroupi, il creuse : du sable vole
      const k = Math.sin(ph * 4); lean = 0.45; sy = 0.78; bob = -0.18; armR = -0.9 + k * 0.6; armL = -0.7 - k * 0.3;
      if (k > 0.96 && (v.puffT = (v.puffT || 0) - 1) < 0 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 35) { v.puffT = 1; game.spawnParticle(v.x + Math.sin(v.yaw) * 0.9, v.y + 0.3, v.z + Math.cos(v.yaw) * 0.9, Math.sin(v.yaw + 2.6) * 1.6, 2.6, Math.cos(v.yaw + 2.6) * 1.6, def.puff || 0xe8cc90, 0.25, 0.7, 9); }
    }
    else if (act === 'lie') { armR = -2.9; armL = -2.9; armRz = 0.5; toolOn = false; }
    else if (act === 'strum') {
      armR = -0.75 + Math.sin(ph * 13) * 0.18; armL = -1.35; armRz = -0.2; bob = Math.abs(Math.sin(ph * 4)) * 0.03;
      if ((v.noteT = (v.noteT || 0) - 1 / 60) < 0 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 30) { v.noteT = 0.7; game.spawnParticle(v.x + (R() - 0.5) * 0.6, v.y + 1.7, v.z + (R() - 0.5) * 0.6, (R() - 0.5) * 0.6, 1.4, (R() - 0.5) * 0.6, [0xffd23a, 0xff7ab0, 0x7ad8ff][v.i % 3], 0.22, 1.4, -0.2); }
    }
    else if (act === 'volley') { const k = Math.abs(Math.sin(ph * 2.4)); armR = -1.6 - k * 1.0; armL = -1.4 - k * 0.9; bob = k * 0.1; }
    else if (act === 'net') { armR = -1.0 + Math.sin(ph * 1.6) * 0.45; armL = -0.8 + Math.sin(ph * 1.6) * 0.3; lean = 0.35; armRz = Math.sin(ph * 1.6) * 0.3; }
    else if (act === 'carry') { armR = -0.4; armL = Math.sin(ph * 1.2) * 0.08; armRz = 0.15; bob = Math.sin(ph * 2) * 0.02; }
    // gestes de la ville : peindre, servir, mimer, laver les vitres, marelle, accordéon, crier, arroser, lire
    else if (act === 'paint') { armR = -1.25 + Math.sin(ph * 4.5) * 0.22; armRz = Math.sin(ph * 2.3) * 0.15; armL = -0.7; lean = 0.08; }
    else if (act === 'serve') { armR = -1.55; armRz = 0.25; armL = Math.sin(ph * 2) * 0.15; }
    else if (act === 'mime') { const k = ph * 1.6; armR = -1.5 + Math.sin(k) * 0.35; armL = -1.5 + Math.sin(k + 1.6) * 0.35; armRz = -0.25; armLz = -0.25; bob = Math.abs(Math.sin(k * 0.5)) * 0.04; lean = Math.sin(k * 0.5) * 0.08; }
    else if (act === 'wipe') { armR = -2.0 + Math.sin(ph * 4) * 0.35; armRz = Math.cos(ph * 4) * 0.35; armL = -0.4; }
    else if (act === 'hop') { const k = (ph * 1.1) % 3; bob = k < 2 ? Math.abs(Math.sin(k * Math.PI * 1.5)) * 0.32 : 0; armR = -0.6; armL = -0.6; armRz = 0.5; armLz = 0.5; sy = k < 2 && bob < 0.05 ? 0.92 : 1; }
    else if (act === 'call') { const s = game.t - (v.shoutAt || -9); armR = s < 1.4 ? -2.1 : Math.sin(ph * 1.2) * 0.1; armRz = s < 1.4 ? -0.5 : 0; armL = -0.5; bob = s < 1.4 ? Math.abs(Math.sin(ph * 8)) * 0.05 : 0; }
    else if (act === 'water') { armR = -0.95 + Math.sin(ph * 0.8) * 0.12; armL = -0.3; lean = 0.12; }
    else if (act === 'read') { armR = -1.15; armL = -1.15; armRz = -0.3; armLz = -0.3; bob = Math.sin(ph * 1.5) * 0.01; }
    else { armR = Math.sin(ph * 1.2) * 0.08; armL = -Math.sin(ph * 1.2) * 0.08; bob = Math.sin(ph * 2) * 0.02; }
    if (waving) { armR = -2.7 + Math.sin(ph * 12) * 0.3; armRz = 0.3; }
    // --- le visage et les réactions (lifeface.js) : clignements, regard qui suit le chien, bouche qui parle,
    // surprise du premier bonjour, sursaut quand on aboie, bâillements, joie quand un défi est réussi
    const fx = v.fx || (v.fx = { hy: 0, hp: 0, ht: 0, look: 0, lookP: 0, lookTt: 0, lookT: 1 + R() * 3 });
    const T = game.t, fdt = st.fdt, me = game.me, E = FACE.EYE, MO = FACE.MOUTH;
    const ddx = me.pos.x - v.x, ddz = me.pos.z - v.z, dist = Math.hypot(ddx, ddz);
    const ago = (k) => (k === undefined ? 99 : T - k);
    const joy = ago(v.joyT), surp = ago(fx.surpT), startle = ago(fx.startT), yawn = ago(fx.yawnT);
    const talking = st.speaker === v, typing = talking && st.typing;
    let eye = E.OPEN, mouth = MO.SMILE, blush = ago(fx.blushT) < 5, roll = 0, spin = 0, lookUp = 0, wag = Math.sin(ph * 2.6 + v.i) * 0.22, earA = FACE.twitch(fx, fdt);
    const free = !FIXED_ACTS.has(act);
    const open = FACE.blink(fx, fdt);
    if (act === 'sleep') { eye = E.SHUT; mouth = Math.sin(ph * 1.6) > 0.55 ? MO.TALK : MO.SMILE; wag = 0; earA = -0.12; }
    else if (act === 'sad') { eye = E.SAD; earA = -0.22 + earA * 0.4; wag = 0; }
    else if (act === 'cheer' || act === 'jumpy') { eye = E.HAPPY; mouth = MO.WIDE; wag = Math.sin(ph * 14) * 0.6; }
    else if (dist < 8 && v.awake) wag = Math.sin(ph * 10 + v.i) * 0.5;   // (content de voir le chien : la queue remue)
    if (talking) {
      mouth = typing && Math.sin(T * 17 + v.i) > -0.25 ? (st.loud ? MO.WIDE : MO.TALK) : MO.SMILE;
      if (st.loud && !typing) eye = E.HAPPY;
      if (free) { const k = T * 3.1 + v.i; armR = -0.5 - Math.abs(Math.sin(k)) * 0.75; armL = -0.3 - Math.abs(Math.sin(k * 0.73 + 1)) * 0.5; armRz = 0.15 + Math.sin(k * 0.5) * 0.15; armLz = 0.1; }
      if (typing) lookUp += Math.sin(T * 7.5) * 0.06;
    }
    if (yawn >= 0 && yawn < 3.2) {
      // un grand bâillement en s'étirant
      const k = yawn < 0.5 ? yawn / 0.5 : yawn < 1.9 ? 1 : Math.max(0, 1 - (yawn - 1.9) / 0.6);
      eye = yawn < 2.5 ? E.SHUT : E.SLEEPY; mouth = k > 0.4 ? MO.WIDE : MO.SMILE; earA = -0.15 * k;
      lookUp -= 0.4 * k; sy *= 1 + 0.06 * k;
      if (free) { armR = -2.9 * k; armL = -2.9 * k; armRz = 0.35 * k; armLz = 0.35 * k; }
    }
    if (startle < 1.6) {
      // ouaf ! un sursaut (yeux ronds, bras en l'air), puis un petit rire
      if (startle < 0.8) { eye = E.WOW; mouth = MO.WIDE; if (startle < 0.4) bob += Math.sin(startle / 0.4 * Math.PI) * 0.28; lean -= 0.12; earA = 0.5; if (free) { armR = -2.3 + Math.sin(T * 30) * 0.2; armL = -2.3 - Math.sin(T * 30) * 0.2; armRz = 0.3; armLz = 0.3; } }
      else { eye = E.HAPPY; mouth = MO.TALK; }
    }
    if (surp < 1.0) {
      // premier bonjour : « ! », un petit bond de surprise (puis un signe de la patte)
      eye = E.WOW; mouth = MO.WIDE; earA = 0.45;
      if (surp < 0.45) bob += Math.sin(surp / 0.45 * Math.PI) * 0.32;
      if (free) { armR = -1.9; armL = -1.9; armRz = 0.4; armLz = 0.4; }
    }
    if (v.joyT !== undefined && fx.joyFx !== v.joyT) {
      fx.joyFx = v.joyT;
      if (game.juice && dist < 60) { game.juice.hearts(v.x, v.y + 2.0 * (def.scale || 1), v.z, 6); game.juice.confetti(v.x, v.y + 2.2 * (def.scale || 1), v.z, 36, 0.8); }
    }
    if (joy < 4.4) {
      // défi réussi : trois sauts de joie, puis une petite danse de remerciement (un tour sur soi, on se dandine)
      eye = E.HAPPY; mouth = MO.WIDE; blush = true; wag = Math.sin(ph * 18) * 0.75; earA = 0.35 + Math.sin(T * 12) * 0.12;
      if (joy < 1.5) { bob += Math.abs(Math.sin(joy / 0.5 * Math.PI)) * 0.55 * (1 - joy / 2.2); armR = -2.8; armL = -2.8; armRz = 0.3; armLz = 0.3; }
      else {
        const d = joy - 1.5, u = Math.min(1, d / 0.8);
        spin = u * u * (3 - 2 * u) * TAU; roll = Math.sin(d * 7) * 0.12; bob += Math.abs(Math.sin(d * 7)) * 0.12;
        armR = -2.6 + Math.sin(d * 7) * 0.5; armL = -2.6 - Math.sin(d * 7) * 0.5; armRz = 0.4; armLz = 0.4;
        if (d > 0.8 && (fx.noteT = (fx.noteT || 0) - fdt) < 0 && dist < 40) { fx.noteT = 0.35; game.spawnParticle(v.x + (R() - 0.5) * 0.6, v.y + 2.1 * (def.scale || 1), v.z + (R() - 0.5) * 0.6, (R() - 0.5) * 0.6, 1.3, (R() - 0.5) * 0.6, [0xff7ab0, 0xffd23a, 0x7ad8ff][v.i % 3], 0.2, 1.2, -0.2); }
      }
    }
    if (open < 0.45 && (eye === E.OPEN || eye === E.SAD || eye === E.SLEEPY)) eye = E.SHUT;
    // la tête suit le chien (ou regarde autour de soi de temps en temps)
    let ty = 0, tp = 0, tt = 0;
    if (v.awake && act !== 'lie' && act !== 'sleep' && dist < 11 && Math.abs(me.pos.y - v.y) < 4) {
      ty = wrapA(Math.atan2(ddx, ddz) - v.yaw - spin);
      ty = Math.abs(ty) > 1.9 ? 0 : clamp(ty, -1.05, 1.05);   // (trop derrière : on n'insiste pas)
      tp = clamp(-Math.atan2(me.pos.y + 0.9 - (v.y + 1.45 * (def.scale || 1)), Math.max(1, dist)) * 0.8, -0.3, 0.4);
      tt = Math.sin(T * 0.7 + v.i) * 0.08;
      if (act === 'look' || act === 'trumpet' || act === 'lute') { ty *= 0.25; tp *= 0.25; }
    } else if (v.awake && act !== 'lie') {
      if ((fx.lookT -= fdt) <= 0) { fx.lookT = 2 + R() * 4; fx.look = R() < 0.35 ? 0 : (R() - 0.5) * 1.3; fx.lookP = (R() - 0.6) * 0.25; fx.lookTt = (R() - 0.5) * 0.25; }
      ty = fx.look; tp = fx.lookP; tt = fx.lookTt;
    }
    if (talking) tt += Math.sin(T * 1.7) * 0.1;
    const kh = Math.min(1, fdt * 7);
    fx.hy += (ty - fx.hy) * kh; fx.hp += (tp + lookUp - fx.hp) * kh; fx.ht += (tt - fx.ht) * kh;
    // au repos, on se balance d'une jambe sur l'autre
    if (!talking && joy > 4.4 && IDLE_ACTS.has(act)) { roll += Math.sin(ph * 0.75 + v.i) * 0.035; bob += Math.sin(ph * 1.5 + v.i) * 0.012; }
    const RG = st.rg; RG.o = open; RG.tail = wag; RG.ear = earA; RG.up = joy < 4.4 ? 0.35 : 0; RG.hy = fx.hy; RG.hp = fx.hp; RG.ht = fx.ht;
    st.rgf.tile = FACE.tileOf(eye, mouth, blush);
    const sc = def.scale || 1;
    if (def.pet && v.petX !== undefined) {
      const fm = faunaModel[def.pet.kind];
      if (fm) {
        const hop = Math.abs(Math.sin(ph * 12)) * 0.12 * (v.petRun || 0), pf = v.petFx || (v.petFx = {}), pr = st.rgc;
        pr.o = FACE.blink(pf, st.fdt); pr.tail = Math.sin(ph * 13) * 0.55; pr.up = 0.2; pr.ear = FACE.twitch(pf, st.fdt); pr.hy = pr.hp = pr.ht = 0;
        drawCreature(fm, v.petX, ground(v.petX, v.petZ) + hop, v.petZ, v.petYaw || 0, 0, 0, def.pet.scale || fm.f.scale || 1, 1, 0, fm.mdl.tint ? C.setHex(def.pet.tint || 0xe8c49a) : undefined, false, pr); shadow(v.petX, v.petZ, 0.4);
      }
    }
    if (def.body === 'critter' && def.sleepy) {
      // un habitant-bête (phoque qui bronze, tortue…) : il bouge à peine, applaudit quand on lui parle
      const fm = faunaModel[def.model];
      const nap = !v.awake;
      if (nap) RG.o = 0.07;
      if (fm) drawCreature(fm, v.x, v.y + (waving ? Math.abs(Math.sin(ph * 9)) * 0.1 : 0), v.z, v.yaw, nap ? 0.05 : -0.12 + Math.sin(ph * 0.8) * 0.05, nap ? 0.5 + Math.sin(ph * 0.6) * 0.05 : 0, sc, 1 + (nap ? Math.sin(ph * 1.4) * 0.03 : 0), waving ? Math.sin(ph * 16) * 0.9 : Math.sin(ph * 1.1) * 0.15, undefined, false, RG);
      shadow(v.x, v.z, (fm ? fm.mdl.r : 0.5) * sc);
      if (nap && (v.zzT = (v.zzT || 0) - 1 / 60) < 0 && Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < 25) { v.zzT = 1.4; game.spawnParticle(v.x, v.y + 1.2 * sc, v.z, 0.2, 0.8, 0, 0xffffff, 0.2, 1.6, -0.1); }
      return;
    }
    if (def.body === 'penguin' || def.body === 'critter') {
      const fm = faunaModel[def.model || 'skater'] || faunaModel.penguin;
      if (fm) drawCreature(fm, v.x, v.y + bob, v.z, v.yaw + spin, 0, (act === 'skate' ? Math.sin(ph * 2.2) * 0.15 : 0) + roll, sc, 1, act === 'skate' ? 0.6 + Math.sin(ph * 2.2) * 0.4 : waving || joy < 4.4 ? 1.2 : 0.1, undefined, false, RG);
      shadow(v.x, v.z, 0.5 * sc);
      return;
    }
    if (def.body === 'snowman' || def.body === 'yeti' || def.body === 'scarecrow') {
      const big = def.body === 'yeti', scr = def.body === 'scarecrow', L1 = big ? vill.yeti : scr ? vill.scare : vill.snow, LA = big ? vill.yetiArm : scr ? vill.scareArm : vill.snowArm;
      const wake = v.awake ? 1 : 0;
      compose(v.x, v.y + (wake ? Math.abs(Math.sin(ph * (waving ? 9 : 1.5))) * 0.06 : 0) + (joy < 4.4 || surp < 1 || startle < 1 ? bob : 0), v.z, v.yaw + spin, 0, wake ? Math.sin(ph * 1.3) * 0.05 : 0, sc);
      if (!wake) RG.o = 0.07;
      L1.push(m4, undefined, RG);
      const base = mB.copy(m4);
      for (const sd of [-1, 1]) {
        const ang = scr ? (sd > 0 && waving ? 2.6 + Math.sin(ph * 12) * 0.3 : 1.55 + wake * Math.sin(ph * 1.7 + sd) * 0.12) : sd > 0 ? (waving ? 2.4 + Math.sin(ph * 12) * 0.3 : 0.9 + wake * Math.sin(ph * 2) * 0.2) : 0.9;
        m5.copy(base).multiply(m6.compose(v4.set(sd * (big ? 0.85 : scr ? 0.36 : 0.42), big ? 2.0 : scr ? 1.68 : 1.42, 0), q4.setFromEuler(e4.set(0, 0, sd * ang)), one));
        LA.push(m5);
      }
      if (!big) { m5.copy(base).multiply(m6.makeTranslation(0, scr ? 2.25 : 2.22, 0)); hatL.push(m5, C.setHex(def.hat || 0x2a2430)); }
      shadow(v.x, v.z, big ? 1.1 : 0.7);
      return;
    }
    if (def.ghost) {
      // le gentil fantôme-chat : il flotte, se balance, et brille un peu
      const fy = v.y + 0.5 + Math.sin(ph * 1.7) * 0.25;
      compose(v.x, fy, v.z, v.yaw + Math.sin(ph * 0.9) * 0.3, 0, Math.sin(ph * 1.3) * 0.12, sc, sc * (1 + Math.sin(ph * 3) * 0.04), sc);
      vill.ghost.push(m4, undefined, RG);
      if (vill.catFace) vill.catFace.push(headMat(m4, FACE.NECK.cat, RG), undefined, st.rgf);
      glow(v.x, fy + 1.3, v.z, 3.2, 0x9ac8ff, 0.35);
      return;
    }
    const cat = def.body === 'cat' && vill.cat;
    furTint.setHex(def.fur || 0xe8c49a);
    // allongé sur sa serviette (sur le dos, le nez au soleil) ou debout
    if (act === 'lie') compose(v.x, v.y + 0.32 + Math.sin(ph * 1.3) * 0.01, v.z, v.yaw, -Math.PI / 2, 0, sc, sc, sc);
    else compose(v.x, v.y + bob, v.z, v.yaw + spin, lean, roll, sc, sc * sy, sc);
    (cat ? vill.cat : vill.body).push(m4, furTint, RG);
    const summer = def.outfit === 'summer' && vill.summer;
    (cat ? vill.catCloth : summer ? vill.summer : vill.cloth).push(m4, C.setHex(def.cloth || 0xd84a3a), RG);
    // le visage (et tout ce qui est posé sur la tête) suit la tête
    const hm = headMat(m4, cat ? FACE.NECK.cat : FACE.NECK.dog, RG);
    (cat ? vill.catFace : vill.face).push(hm, undefined, st.rgf);
    // (sur téléphone : chapeaux et outils seulement de près)
    const close = !lite || Math.hypot(game.me.pos.x - v.x, game.me.pos.z - v.z) < (cfg.liteDetail || 30);
    if (def.sunhat && vill.sunhat && close) vill.sunhat.push(hm);
    const base = mB.copy(m4);
    if (def.cap && caps[def.cap]) caps[def.cap].push(hm);
    if (act === 'juggle' && jballL) for (let k = 0; k < 3; k++) {
      const a = ph * 5 + k * TAU / 3;
      m5.copy(base).multiply(m6.makeTranslation(Math.cos(a) * 0.42, 2.05 + Math.abs(Math.sin(a)) * 0.75, 0.42));
      jballL.push(m5, C.setHex([0xff5a6a, 0xffd23a, 0x5ac8ff][k]));
    }
    for (const sd of [1, -1]) {
      const a = sd > 0 ? armR : armL;
      m5.copy(base).multiply(m6.compose(v4.set(sd * 0.36, 1.12, 0.04), q4.setFromEuler(e4.set(a, 0, sd * (0.18 + (sd > 0 ? armRz : armLz)), 'ZYX')), one));
      vill.arm.push(m5, summer ? furTint : C.setHex(def.cloth || 0xd84a3a));
      if (sd > 0 && toolOn && close && def.tool && tools[def.tool]) { m5.multiply(m6.makeTranslation(0, -0.5, 0.02)); tools[def.tool].push(m5); }
    }
    if (def.platform && platforms[def.platform]) {
      // la nacelle sous ses pieds, et deux câbles jusqu'au toit
      const pf = platforms[def.platform], top = def.lift ? def.lift.top : v.y + 6;
      compose(v.x, v.y, v.z, def.yaw || 0, 0, 0, 1); pf.base.push(m4);
      const hh = Math.max(0.1, top - v.y - 1.0);
      for (const sd of [-1, 1]) { compose(v.x + Math.cos(def.yaw || 0) * sd * 1.1, v.y + 1.0, v.z - Math.sin(def.yaw || 0) * sd * 1.1, 0, 0, 0, 1, hh, 1); pf.cable.push(m4); }
      return;
    }
    shadow(v.x, v.z, 0.5 * sc);
  }

  /** Les yeux, les oreilles et la queue d'une bête : elle cligne, frémit, remue la queue quand on la caresse. */
  function critterRig(c, dt) {
    const fx = c.fx || (c.fx = {}), RG = st.rgc, petK = game.t - c.petT, happy = petK < 3.5 || c.followT > 0;
    RG.o = c.s === 'curl' ? 0.07 : petK < 1.6 ? 0.35 : FACE.blink(fx, dt);
    RG.ear = FACE.twitch(fx, dt, petK < 3 ? 3 : 1) + (petK < 3 ? 0.2 : 0);
    RG.tail = happy ? Math.sin(c.ph * 17) * 0.65 : c.s === 'flee' ? Math.sin(c.ph * 22) * 0.12 : Math.sin(c.ph * 2.3 + c.i) * 0.16;
    RG.up = happy ? 0.25 : c.s === 'flee' ? 0.3 : 0;
    RG.hy = RG.hp = RG.ht = 0;
    return RG;
  }
  function refreshNear() {
    const me = game.me, x = me.pos.x, z = me.pos.z;
    st.near.c = cGrid.within(x, z, VIEW).map(q => q.c);
    st.near.p = pGrid.within(x, z, VIEW).map(q => q.p);
    st.near.s = sGrid.within(x, z, VIEW * 0.8).map(q => q.s);
  }

  function render(dt, t) {
    const me = game.me; if (!me) return;
    camQ.copy(game.camera.quaternion);
    // le voisinage (recalculé quatre fois par seconde)
    if ((st.nearT -= dt) <= 0 || Math.abs(me.pos.x - (st.nearX || 0)) + Math.abs(me.pos.z - (st.nearZ || 0)) > 20) { st.nearT = 0.25; st.nearX = me.pos.x; st.nearZ = me.pos.z; refreshNear(); }
    // événements de l'hôte (chez un ami)
    for (const l of layers.values()) l.begin();
    const barks = game.players.filter((P) => { const prev = P._lifeBark || 0, b = P.barkT || 0; P._lifeBark = b; return b > prev + 0.3; });
    st.fdt = Math.min(0.1, dt || 0.016); st.barks = barks;
    // qui parle ? (la bouche de l'habitant bouge pendant que le texte s'écrit)
    st.speaker = null; st.typing = false; st.loud = false;
    const dg = game.dialog;
    if (dg) {
      const ln = dg.lines ? dg.lines[dg.i] || {} : null, who = ln ? ln.who : game.dom.dname && game.dom.dname.textContent;
      st.typing = !(game.dom.dialog && game.dom.dialog.classList.contains('done'));
      st.loud = /!/.test(ln ? ln.text || '' : (game.dom.dtext && game.dom.dtext.textContent) || '');
      if (who) { let best = 16; for (const v of villagers) { if ((v.who || (v.who = (lines[v.def.id] || {}).who || v.def.name)) !== who) continue; const d = Math.hypot(v.x - me.pos.x, v.z - me.pos.z); if (d < best) { best = d; st.speaker = v; } } }
    }
    // bêtes
    const act2 = ACTIVE * ACTIVE;
    for (const c of st.near.c) {
      const d2 = (c.x - me.pos.x) ** 2 + (c.z - me.pos.z) ** 2;
      if (d2 < act2) stepCreature(c, dt, t, barks);
      // sur téléphone, les petites bêtes ne sont dessinées que de près (moins d'appels de dessin)
      if (lite && c.f.liteNear && d2 > c.f.liteNear * c.f.liteNear) continue;
      if (c.f.hole && c.i === 0 && !(lite && c.f.ai === 'scuttle' && !(c.under > 0.05))) { compose(c.hx, surface(c.hx, c.hz), c.hz, c.hx * 7.3, 0, 0, c.f.holeS || 1); propModel[holeKind(c.f)].l.push(m4); }
      if (c.y < -100) continue;
      const fm = c.fm, ai = c.f.ai;
      let pitch = c.pitch || 0, roll = 0, sqy = 1;
      if (ai === 'slide' && c.slide > 0) { pitch = 1.35; }
      if (ai === 'slide' && !(c.slide > 0)) roll = c.s === 'walk' ? Math.sin(c.ph * 9) * 0.12 : Math.sin(c.ph * 2) * 0.04;
      if (c.s === 'pet') sqy = 1 + Math.sin(c.ph * 12) * 0.08;
      if (c.sq) sqy *= c.sq;
      if (c.roll) roll += c.roll;
      if (c.s === 'curl') { sqy = 0.72; pitch = 0.5; }
      if (c.puff > 0) sqy = 1 + Math.sin(c.puff / 0.6 * Math.PI * 3) * 0.12;
      if ((ai === 'burrow' || (ai === 'scuttle' && c.f.hole)) && c.under > 0.98) continue;
      drawCreature(fm, c.x, c.y + (c.hop || 0), c.z, c.yaw, pitch, roll, c.scale, sqy, ai === 'slide' ? (c.s === 'walk' ? Math.sin(c.ph * 8) * 0.6 : 0) : c.flapA, c.tint !== null && c.tint !== undefined ? C.setHex(c.tint) : undefined,
        (lite && ai === 'flock' && !(c.fly > 0)) || (c.f.foldWings && !(c.fly > 0)) || (lite && c.f.flapNear && d2 > c.f.flapNear * c.f.flapNear), fm.body.rig ? critterRig(c, dt) : undefined);   // (f.flapNear : pinces, nageoires de près seulement)   // (un oiseau posé replie ses ailes — un dessin de moins)
      if (ai === 'hover') { if (c.f.glow !== false) glow(c.x, c.y, c.z, c.f.glowSize || 1.2, c.f.glow || 0x9ad8ff, 0.8); }
      else if (c.f.glow) glow(c.x, c.y + (c.f.glowY || 0), c.z, (c.f.glowSize || 1.2) * c.scale, c.f.glow, 0.6);
      if (ai !== 'hover' && ai !== 'jump' && ai !== 'perch' && !c.f.water && !(c.fly > 0 && c.y - ground(c.x, c.z) > 4)) shadow(c.x, c.z, (c.fm.mdl.r || 0.3) * c.scale);
    }
    // objets
    for (const p of st.near.p) {
      const pm = propModel[p.kind]; if (!pm) continue;
      const pk = pm.pk;
      if (lite && pk.liteNear && (p.x - me.pos.x) ** 2 + (p.z - me.pos.z) ** 2 > pk.liteNear * pk.liteNear) continue;
      if (p.broken > game.t) continue;
      let pitch = 0, roll = 0, sy = 1, sx = 1, y = p.y;
      const w = game.t - p.wob; if (w < 1.2) { roll = Math.sin(w * 22) * 0.18 * (1 - w / 1.2); pitch = Math.cos(w * 19) * 0.08 * (1 - w / 1.2); }
      const s = game.t - p.sq; if (s < 0.6) { const k = Math.sin(s / 0.6 * Math.PI * 3) * (1 - s / 0.6); sy = 1 - k * 0.35; sx = 1 + k * 0.2; }
      const rg = game.t - p.ring; if (rg < 0.8) roll += Math.sin(rg * 30) * 0.05 * (1 - rg / 0.8);
      if (p.r0) { compose(p.x, y + p.r, p.z, p.yaw, p.rot, 0, p.r); pm.l.push(m4, p.def.tint !== undefined ? C.setHex(p.def.tint) : undefined); shadow(p.x, p.z, p.r); continue; }
      if ((p.kind === 'button' || pk.act === 'press') && p.on) sy *= 0.7;
      if (pk.sway) { roll += Math.sin(t * 0.9 + p.i * 1.7) * pk.sway; pitch += Math.sin(t * 0.63 + p.i) * pk.sway * 0.6; }
      if (pk.act === 'build') {
        // un tas de sable qui devient château : l'étage pousse (petit rebond)
        const max = pk.stages || 3, gk = game.t - p.grow, pop = gk < 0.5 ? Math.sin(gk / 0.5 * Math.PI) * 0.15 : 0;
        const k = 0.28 + 0.72 * (p.stage / max);
        sy *= k + pop; sx *= 0.75 + 0.25 * (p.stage / max) + pop * 0.3;
      }
      let ox = 0, oz = 0;
      if (pk.act === 'slide') {
        // la bibliothèque glisse sur le côté (et son obstacle avec elle)
        p.sk += ((p.on ? 1 : 0) - p.sk) * Math.min(1, dt * 2.5);
        const sl = p.def.slide || [2.6, 0];
        ox = sl[0] * p.sk; oz = sl[1] * p.sk;
        if (p.col) { p.col.x = p.x + ox; p.col.z = p.z + oz; }
        if (p.sk > 0.02 && p.sk < 0.98 && R() < dt * 20) game.spawnParticle(p.x + ox + (R() - 0.5) * 2, p.y + 0.1, p.z + oz + (R() - 0.5) * 0.6, 0, 0.8, 0, 0xd8c8b0, 0.2, 0.8, 1);
      }
      if (pk.act === 'spin') { const ss = game.t - (p.spin0 || -99); p.ang = ((p.ang || 0) + dt * (0.25 + Math.sin(t * 0.3 + p.i) * 0.2 + (ss < 3 ? 14 * (1 - ss / 3) : 0))) % TAU; }
      compose(p.x + ox, y, p.z + oz, p.yaw + (p.ang || 0), pitch, roll, sx * (p.def.s || 1), sy * (p.def.s || 1), sx * (p.def.s || 1));
      pm.l.push(m4, p.def.tint !== undefined ? C.setHex(p.def.tint) : undefined);
      if (pk.crown && pk.act === 'build' && p.stage >= (pk.stages || 3) && propModel[pk.crown]) { m5.copy(m4).multiply(m6.makeTranslation(0, pm.mdl.h - 0.05, 0)); propModel[pk.crown].l.push(m5); }
      if (p.kind === 'snowman' || pk.hatY) {
        const hw = game.t - p.wob, hop = hw < 1.0 ? Math.sin(hw / 1.0 * Math.PI) * 1.2 : 0, spin = hw < 1 ? hw * 9 : 0;
        m5.copy(m4).multiply(m6.compose(v4.set(0, (pk.hatY || 2.0) + hop, 0), q4.setFromEuler(e4.set(0, spin, 0)), one));
        hatL.push(m5, C.setHex(p.def.hat || 0x2a2430));
      }
      if (pk.topper) {
        // coiffe qui saute et tourne (heaume d'armure : clong !)
        const hw = game.t - p.wob, hop = hw < 1.0 ? Math.sin(hw / 1.0 * Math.PI) * 1.0 : 0, spin = hw < 1 ? hw * 7 : 0;
        m5.copy(m4).multiply(m6.compose(v4.set(0, (pk.topperY || 2.0) + hop, 0), q4.setFromEuler(e4.set(0, spin, 0)), one));
        toppers[pk.topper].push(m5);
      }
      if (pk.eyes && pupilL) {
        // des yeux qui suivent le chien (dans le repère du tableau)
        const E = pk.eyes, cy = Math.cos(p.yaw), syw = Math.sin(p.yaw);
        const dx = me.pos.x - p.x, dz = me.pos.z - p.z, lx = dx * cy - dz * syw, lz = dx * syw + dz * cy, ly = me.pos.y + 0.8 - (p.y + E.y);
        const l = Math.hypot(lx, ly, lz) || 1, ex = clamp(lx / l * 2, -1, 1) * E.range, ey = clamp(ly / l * 2, -1, 1) * E.range * 0.8;
        for (const sd of [-1, 1]) { m5.copy(m4).multiply(m6.compose(v4.set(sd * E.x + ex, E.y + ey, E.z), q4.identity(), s4.set(E.r, E.r, E.r))); pupilL.push(m5); }
      }
      if ((p.kind === 'chime' || pk.act === 'chime') && rg < 0.8) glow(p.x, p.y + (pk.glowY || 2.0), p.z, 2.4, pk.glow || 0xbfeaff, 1 - rg / 0.8);
      if (p.kind === 'lantern' && p.on) glow(p.x, p.y + 2.35, p.z, 2.2, 0xffd890, 0.9);
      if (pk.lamp && p.on) {
        const Lm = pk.lamp, fl = 0.9 + Math.sin(t * 13 + p.i) * 0.06 + Math.sin(t * 7.7 + p.i * 2) * 0.05;
        glow(p.x, p.y + Lm.y, p.z, (Lm.size || 2.4) * fl, Lm.color || 0xffb050, 0.95);
        if (Lm.fire && !lite && R() < dt * 14) game.spawnParticle(p.x + (R() - 0.5) * 0.4, p.y + Lm.y - 0.1, p.z + (R() - 0.5) * 0.4, (R() - 0.5) * 0.4, 1.6 + R(), (R() - 0.5) * 0.4, R() < 0.5 ? 0xffc040 : 0xff7020, 0.12, 0.7, -0.4);
      }
      if (pk.act === 'bounce' && st.D && st.D.def.type === 'pads' && st.D.def.pads.includes(p.def.id) && !st.D.got.includes(p.def.id)) glow(p.x, p.y + 0.8, p.z, 3.5, 0x8af0ff, 0.6 + Math.sin(t * 8) * 0.3);
      if (pk.shadow) shadow(p.x, p.z, pk.shadow);
      if (pk.spray && R() < dt * (lite ? 14 : 30) && (p.x - me.pos.x) ** 2 + (p.z - me.pos.z) ** 2 < 2000) {
        // arroseur : deux jets qui tournent
        const a = t * (pk.spin || 1.6) + (R() < 0.5 ? 0 : Math.PI), v = 2.6 + R() * 1.2;
        game.spawnParticle(p.x + Math.cos(a) * 0.35, p.y + 0.5, p.z + Math.sin(a) * 0.35, Math.cos(a) * v, 4.2 + R(), Math.sin(a) * v, 0xd8f0ff, 0.11, 0.95, 9);
      }
    }
    // habitants
    for (const v of villagers) {
      const d = Math.hypot(v.x - me.pos.x, v.z - me.pos.z);
      if (d > VIEW + 10) continue;
      if (d < ACTIVE + 20) stepVillager(v, dt, t);
      if (v.def.hidden && d > (v.def.hidden || 16) && !v.awake) continue;
      drawVillager(v, t);
    }
    // les signaux des défis
    const D = st.D;
    for (const dd of defis) {
      const def = dd.def, d = Math.hypot(def.x - me.pos.x, def.z - me.pos.z);
      if (d > VIEW) continue;
      const done = defiDone(def.id), active = D && D.def === def;
      compose(def.x, def.y, def.z, t * 0.5, 0, 0, 1 + (active ? 0 : Math.sin(t * 3) * 0.05));
      propModel.marker.l.push(m4);
      if (!active) {
        compose(def.x, def.y + 1.8 + Math.sin(t * 2.5 + dd.i) * 0.2, def.z, t * 2, 0, 0, done ? 0.7 : 1);
        propModel.star.l.push(m4);
        glow(def.x, def.y + 1.8, def.z, done ? 1.6 : 2.6, done ? 0x9affc8 : 0xffd23a, 0.9);
        if (!lite && d < 40 && R() < dt * 4) game.spawnParticle(def.x + (R() - 0.5) * 2, def.y + 0.2, def.z + (R() - 0.5) * 2, 0, 1.6, 0, done ? 0x9affc8 : 0xffe680, 0.2, 1.0, 0);
      }
    }
    if (D) drawDefi(D, t);
    // traînées de paillettes
    for (const s of st.near.s) {
      if (gone(s.id)) continue;
      const bob = Math.sin(t * 3 + s.k * 0.6) * 0.12;
      compose(s.x, s.y + bob, s.z, t * 2 + s.k, 0, 0, 1);
      propModel.sparkle.l.push(m4);
      if (!lite) glow(s.x, s.y + bob, s.z, 0.9, 0xbfeaff, 0.5);
    }
    for (const d of st.drops) { compose(d.x, d.y, d.z, t * 6, 0, 0, 1.2); propModel.sparkle.l.push(m4); glow(d.x, d.y, d.z, 1.1, 0xd8f4ff, 0.7); }
    // coffres
    const k = sv();
    for (const c of chests) {
      const def = c.def, d = Math.hypot(def.x - me.pos.x, def.z - me.pos.z);
      if (d > VIEW * 0.7) continue;
      const opened = k.chests.includes(def.id);
      compose(def.x, def.y, def.z, def.rot || 0, 0, 0, 1);
      propModel.chest.l.push(m4);
      const oa = opened ? clamp((game.t - c.open) / 0.6, 0, 1) : 0, lidA = opened ? (c.open < 0 ? 1 : oa) * 1.9 : (d < 6 ? Math.abs(Math.sin(t * 6)) * 0.08 : 0);
      m5.copy(m4).multiply(m6.compose(v4.set(0, 0.56, -0.35), q4.setFromEuler(e4.set(-lidA, 0, 0)), one));
      // (cfg.lidNear, téléphone : de loin, un coffre fermé sans son couvercle à part — un dessin de moins)
      if (!(lite && cfg.lidNear && d > cfg.lidNear)) propModel.lid.l.push(m5);
      if (!opened && d < 18) glow(def.x, def.y + 0.9, def.z, 1.6 + Math.sin(t * 4) * 0.3, 0xffd23a, 0.55);
      shadow(def.x, def.z, 0.6);
    }
    // geyser de neige (interrupteur)
    if (st.geyser && st.geyser.t > game.t && R() < dt * 40) { const g = st.geyser, cc = g.cols || [0xbfeaff, 0xffffff]; game.spawnParticle(g.x + (R() - 0.5) * 0.6, g.y !== undefined ? g.y : ground(g.x, g.z) + 0.3, g.z + (R() - 0.5) * 0.6, (R() - 0.5) * 2.5, 9 + R() * 4, (R() - 0.5) * 2.5, R() < 0.3 ? cc[0] : cc[1], 0.35, 1.6, 9); }
    // machine à bulles en marche
    if (st.bubbles && st.bubbles.t > game.t && R() < dt * (lite ? 5 : 9)) { const b = st.bubbles; addFloat(b.x + (R() - 0.5) * 0.4, b.y, b.z + (R() - 0.5) * 0.4, (R() - 0.5) * 2.4, (R() - 0.5) * 2.4); }
    // bulles de savon
    const bm = propModel.bubble;
    st.floats = st.floats.filter((b) => {
      b.t += dt; b.ph += dt;
      b.x += (b.vx + Math.sin(b.ph * 1.3) * 0.4) * dt; b.z += (b.vz + Math.cos(b.ph * 1.1) * 0.4) * dt; b.y += 0.45 * dt; b.vx *= 1 - dt * 0.5; b.vz *= 1 - dt * 0.5;
      for (const P of game.players) if (hit(P, b.x, b.y, b.z, 0.9 + b.s * 0.5)) { game.burst(b.x, b.y, b.z, 6, 0xe8f6ff, 2, 0.35); if (P === game.me) chirp('ting'); return false; }
      if (b.t > b.life) { game.burst(b.x, b.y, b.z, 4, 0xe8f6ff, 1.5, 0.3); return false; }
      const k = Math.min(1, b.t * 3) * b.s;
      if (bm) { compose(b.x, b.y, b.z, b.ph, 0, 0, k, k * (1 + Math.sin(b.ph * 7) * 0.05), k); bm.l.push(m4); } else glow(b.x, b.y, b.z, k * 2, 0xd8f0ff, 0.6);
      return true;
    });
    if (cfg.renderExtra) cfg.renderExtra(dt, t, { glow, layer: (n) => layers.get(n) });
    for (const l of layers.values()) l.end();
    // le bandeau de quête suit le défi (chrono)
    if ((st.hudT -= dt) <= 0) { st.hudT = 0.25; const q = questText(); if (q !== st.hudQ) { st.hudQ = q; game.updateHud(); } }
  }
  function drawDefi(D, t) {
    const def = D.def, T = def.type;
    if (T === 'coins') {
      const im = propModel[def.item || 'coin'] || propModel.coin;
      def.items.forEach((it, i) => {
        if (D.got.includes(i)) return;
        const col = def.colors ? def.colors[i % def.colors.length] : 0xff4a5a;
        compose(it.x, it.y + Math.sin(t * (def.item ? 1.6 : 3) + i) * (def.item ? 0.25 : 0.15), it.z, def.item ? Math.sin(t + i) * 0.3 : t * 3 + i, 0, def.item ? Math.sin(t * 1.3 + i) * 0.12 : 0, def.item ? 1 : 1.2);
        im.l.push(m4, def.colors ? C.setHex(col) : undefined); glow(it.x, it.y, it.z, def.item ? 1.6 : 2.0, col, def.item ? 0.35 : 0.8);
      });
    }
    if (T === 'herd' && def.item) {
      const im = propModel[def.item];
      for (const c of D.crit) {
        if (c.st === 'home') { compose(def.pen.x + Math.cos(D.crit.indexOf(c) * 2.1) * 1.2, ground(def.pen.x, def.pen.z) + 0.05, def.pen.z + Math.sin(D.crit.indexOf(c) * 2.1) * 1.2, c.a, 0, 0, 1); im.l.push(m4, def.colors ? C.setHex(def.colors[D.crit.indexOf(c) % def.colors.length]) : undefined); continue; }
        const fl = c.st === 'follow', y = c.st === 'stuck' ? c.y : c.y + (fl ? 1.0 + Math.sin(t * 4) * 0.1 : 0.05);
        compose(c.x, y, c.z, fl ? t * 4 : c.yaw, c.st === 'stuck' ? 0.5 : 0, 0, 1); im.l.push(m4, def.colors ? C.setHex(def.colors[D.crit.indexOf(c) % def.colors.length]) : undefined);
        if (c.st !== 'follow') glow(c.x, y + 0.4, c.z, 1.6, 0xffd23a, 0.6 + Math.sin(t * 6) * 0.3);
      }
      const pen = def.pen; glow(pen.x, ground(pen.x, pen.z) + 0.4, pen.z, pen.r * 2.4, 0xffd23a, 0.35);
    }
    if (T === 'hits') for (const id of def.props) { if (D.got.includes(id)) continue; const p = propById.get(id); if (p) glow(p.x, p.y + 1.2, p.z, 2.6, 0xffd23a, 0.5 + Math.sin(t * 6) * 0.25); }
    if (T === 'goal') {
      const pen = def.pen, gy = ground(pen.x, pen.z);
      glow(pen.x, gy + 0.3, pen.z, pen.r * 2.6, 0xffd23a, 0.4 + Math.sin(t * 4) * 0.15);
      for (const id of def.balls) { const b = propById.get(id); if (b && !D.got.includes(id)) glow(b.x, b.y + b.r * 2 + 0.5, b.z, 1.2, 0xffffff, 0.5); }
    }
    if (T === 'rings') def.rings.forEach((r, i) => { if (i < D.i) return; compose(r.x, r.y, r.z, r.yaw || 0, 0, 0, i === D.i ? 1 + Math.sin(t * 6) * 0.06 : 0.85); propModel.ring.l.push(m4); if (i === D.i) glow(r.x, r.y, r.z, 3.5, 0xffd23a, 0.5); });
    if (T === 'race') {
      const e = def.path[def.path.length - 1];
      compose(e[0], ground(e[0], e[1]), e[1], 0, 0, 0, 1); propModel.finish.l.push(m4); glow(e[0], ground(e[0], e[1]) + 3, e[1], 3, 0xffffff, 0.6);
    }
    if (T === 'race' || T === 'chase' || (T === 'herd' && !def.item)) {
      const fm = faunaModel[def.critter]; if (!fm) return;
      for (const c of D.crit) {
        const hop = fm.f.hopper !== false && !def.air ? Math.abs(Math.sin(c.a)) * 0.35 : 0;
        drawCreature(fm, c.x, c.y + hop, c.z, c.yaw, fm.f.ai === 'slide' && T === 'race' ? 1.35 : 0, 0, (fm.f.scale || 1) * (T === 'chase' ? 1.1 : 1), 1, def.air ? Math.sin(c.a * 1.6) * 0.9 : 0, fm.mdl.tint ? C.setHex(c.tint || 0xe8c49a) : undefined);
        shadow(c.x, c.z, fm.mdl.r * (def.air ? 1.6 : 1));
        if (T === 'herd' && c.st === 'lost') glow(c.x, c.y + 1.3, c.z, 1.4, 0xffd23a, 0.6 + Math.sin(t * 6) * 0.3);
        if (T === 'chase') glow(c.x, c.y + 1.2, c.z, 1.2, 0x40c060, 0.6);
      }
      if (T === 'herd') { const pen = def.pen; glow(pen.x, ground(pen.x, pen.z) + 0.4, pen.z, pen.r * 2.4, 0xffd23a, 0.35); }
    }
    if (T === 'whack' || T === 'fish') {
      const fm = faunaModel[T === 'fish' ? (def.critter || 'fish') : (def.critter || 'marmot')], hm = propModel[def.hole || 'hole'];
      for (const c of D.crit) {
        compose(c.x, c.y, c.z, c.x * 3.1, 0, 0, 1); hm.l.push(m4);
        if (c.up <= 0 || !fm) continue;
        if (T === 'whack') { const k = c.hit ? clamp(c.up / 0.35, 0, 1) : clamp(c.t / 0.15, 0, 1); drawCreature(fm, c.x, c.y - 0.9 + k * 0.9, c.z, c.yaw, 0, 0, fm.f.scale || 1, c.hit ? 0.6 : 1, 0); glow(c.x, c.y + 0.9, c.z, 1.2, 0xffe070, 0.4); }
        else { const k = clamp(c.t / 1.5, 0, 1); if (c.hit) continue; drawCreature(fm, c.x + Math.sin(c.yaw) * fishOff(def, k), c.y + Math.sin(k * Math.PI) * 2.6, c.z + Math.cos(c.yaw) * fishOff(def, k), c.yaw, (k - 0.5) * 2.4, 0, 1.6, 1, 0); }
      }
    }
    if (T === 'scare') {
      const fm = faunaModel[def.critter]; if (!fm) return;
      for (const c of D.crit) {
        if (c.st === 'gone') continue;
        const sit = c.st === 'sit';
        drawCreature(fm, c.x, c.y + (sit ? Math.abs(Math.sin(c.a * 5)) * 0.04 : 0), c.z, c.yaw + (sit ? Math.sin(c.a * 0.8) * 0.6 : 0), sit ? Math.max(0, Math.sin(c.a * 4)) * 0.6 : -0.2, 0, (fm.f.scale || 1) * 1.1, 1, sit ? 0 : Math.sin(t * 30) * 0.9, undefined, sit && fm.f.foldWings);
        if (sit) { shadow(c.x, c.z, 0.25); glow(c.x, c.y + 1.0, c.z, 0.9, 0xffd23a, 0.4 + Math.sin(t * 6 + c.a) * 0.2); }
      }
    }
    if (T === 'volley') {
      const b = D.crit[0], pm = propModel[def.ball || 'beachball'];
      if (pm && b) { compose(b.x, b.y, b.z, b.a, b.a * 1.3, 0, 0.32); pm.l.push(m4); shadow(b.x, b.z, 0.35); if (b.side === 'us') glow(b.x, ground(b.x, b.z) + 0.15, b.z, 1.6, 0xffe070, 0.5); }
    }
    if (T === 'build') for (const id of def.props) { const p = propById.get(id); if (p && p.stage < ((pal.props[p.kind] || {}).stages || 3)) glow(p.x, p.y + 1.2, p.z, 2.4, 0xffd23a, 0.45 + Math.sin(t * 6) * 0.2); }
    if (T === 'xylo') for (const id of def.chimes) { const p = propById.get(id); if (p && D.phase === 'play') glow(p.x, p.y + 2.6, p.z, 0.9, 0xffffff, 0.4); }
  }

  // --- texte de quête, carte ------------------------------------------------------------------------
  function questText() {
    const D = st.D; if (!D) return null;
    const def = D.def, tm = D.t === Infinity ? '' : ` · ⏱ ${Math.max(0, Math.ceil(D.t))} s`;
    if (D.cd > 0) return `⚡ ${def.name} : attention…`;
    const T = def.type;
    const prog = T === 'coins' ? `${D.got.length}/${def.items.length}` : T === 'rings' ? `anneau ${Math.min(D.i + 1, def.rings.length)}/${def.rings.length}` : T === 'pads' ? `${D.got.length}/${def.pads.length}`
      : T === 'hits' ? `${D.got.length}/${def.props.length}` : T === 'goal' ? `${D.got.length}/${def.balls.length}`
      : T === 'whack' || T === 'fish' || T === 'volley' ? `${D.got.length}/${def.need}` : T === 'build' ? `${D.got.length}/${def.props.length}` : T === 'tag' || T === 'chase' ? `${D.crit.filter(c => c.tagged).length}/${D.crit.length}` : T === 'herd' ? `${D.crit.filter(c => c.st === 'home').length}/${D.crit.length}` : T === 'scare' ? `${D.crit.filter(c => c.st !== 'sit').length}/${D.crit.length}`
        : T === 'xylo' ? (D.phase === 'show' ? 'écoutez…' : `${D.k}/${D.seq.length}`) : 'vite !';
    return `⚡ ${def.name} : ${prog}${tm}`;
  }
  function marks() {
    const out = [], k = sv();
    for (const d of plan.defis) out.push([d.x, d.z, k.defis.includes(d.id) ? '#9affc8' : '#ffd23a', 2.6]);
    return out;
  }

  // --- réseau -----------------------------------------------------------------------------------------
  const r2 = (v) => Math.round(v * 100) / 100;
  function snapshot() {
    const D = st.D;
    return {
      d: D ? [D.i, r2(D.t === Infinity ? -1 : D.t), r2(D.cd), D.got, D.phase, D.k, D.def === undefined ? 0 : plan.defis.indexOf(D.def), D.crit.map(c => [r2(c.x), r2(c.y), r2(c.z), r2(c.yaw), c.tagged ? 1 : 0, c.st || 0, r2(c.up || 0), r2(c.t || 0), c.hit || 0])] : 0,
      ev: st.ev,
      dr: st.drops.map(d => [r2(d.x), r2(d.y), r2(d.z)]),
      br: props.filter(p => p.broken > game.t || p.moved || p.on || p.stage !== p.stage0).map(p => [p.i, r2(p.broken - game.t), r2(p.x), r2(p.z), r2(p.r), p.on ? 1 : 0, p.stage === undefined ? 0 : p.stage, r2(p.y)]),
    };
  }
  function apply(x) {
    if (!x) return;
    if (x.d) {
      const [i, t, cd, got, phase, kk, di, crit] = x.d;
      const def = plan.defis[di];
      if (!st.D || st.D.def !== def) st.D = { def, crit: [], got: [], seq: def.seq || [] };
      Object.assign(st.D, { i, t: t < 0 ? Infinity : t, cd, got, phase, k: kk });
      st.D.crit = crit.map(c => ({ x: c[0], y: c[1], z: c[2], yaw: c[3], tagged: !!c[4], st: c[5], up: c[6], t: c[7], hit: c[8], a: game.t * 14, id: def.kids ? def.kids[crit.indexOf(c)] : undefined }));
    } else st.D = null;
    for (const [seq, type, a, b] of x.ev || []) if (seq > st.seen) { st.seen = seq; playEvent(type, a, b); }
    st.drops = (x.dr || []).map(d => ({ x: d[0], y: d[1], z: d[2], vx: 0, vy: 0, vz: 0, t: 0 }));
    const br = new Map((x.br || []).map(b => [b[0], b]));
    for (const p of props) {
      const b = br.get(p.i);
      if (!b) { if (p.broken > game.t) p.broken = 0; if (p.r0) { p.x = p.bx; p.z = p.bz; p.r = p.r0; p.y = ground(p.x, p.z); } p.on = false; if (p.stage0 !== undefined) p.stage = p.stage0; continue; }
      p.broken = b[1] > 0 ? game.t + b[1] : 0;
      if (p.r0) { p.rot += Math.hypot(b[2] - p.x, b[3] - p.z) / (p.r || 1); p.x = b[2]; p.z = b[3]; p.r = b[4]; p.y = ground(p.x, p.z); }
      if (p.stage0 !== undefined && b[6] !== undefined) p.stage = b[6];
      p.on = !!b[5];
    }
    for (const q of props) if (q.kind === 'lantern') q.on = props.some(p => p.kind === 'button' && p.on && p.def.effect === 'lights' && p.def.group === q.def.group);
  }

  // --- pas de jeu (hôte) ------------------------------------------------------------------------------
  function step(dt) {
    // traînées : on ramasse les paillettes
    for (const P of game.players) for (const q of sGrid.within(P.pos.x, P.pos.z, 2.2)) {
      const s = q.s; if (gone(s.id)) continue;
      if (hit(P, s.x, s.y, s.z, 1.6)) {
        sv().gone[s.id] = Date.now();
        gain(P, 1, s.x, s.y, s.z);
        const left = s.trail.pts.filter((_, i) => !gone(`${s.trail.id}_${i}`)).length;
        if (!left) { game.sound('chain'); game.burst(s.x, s.y + 0.5, s.z, 24, 0xbfeaff, 5, 0.8); dropSparkles(s.x, s.y, s.z, 3, 1); if (s.trail.say) game.localBanner(s.trail.say, '', 1600); }
        game.persist();
      }
    }
    stepProps(dt);
    stepDefi(dt);
    stepDrops(dt);
  }
  function applySave() { /* l'état vient de game.save.life : rien à recopier */ }

  const api = {
    step, render, candidates, interact, snapshot, apply, applySave, questText, marks,
    get active() { return st.D; },
    /** Arrête le défi en cours sans récompense (changement de niveau, réapparition…). */
    stopDefi: () => { st.D = null; },
    startDefi: (id, P) => { const d = plan.defis.find(q => q.id === id); if (d) startDefi(d, P || game.player); },
    stats: () => ({ creatures: creatures.length, props: props.length, villagers: villagers.length, defis: defis.length, secrets: chests.length, sparkles: sparkles.length, layers: layers.size }),
    creatures, props, villagers, chests, plan, layers,
  };
  game._life = api;   // (outils de vérification : la couche de vie du niveau en cours)
  return api;
}
