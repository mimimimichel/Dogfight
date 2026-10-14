/*
 * Matcha & Ainu — Niveau 8 « Le Château des Chats » : décor et règles
 * (douves et pont-levis, pattes dorées, pelotes géantes à pousser, Salle du
 * Point Rouge, Arbre à Chats, salle du trône, jeu de chat avec la Capitaine
 * et grande fête de la réconciliation). Le moteur commun est dans game.js.
 *
 * Tout ce qui est fixe est fusionné par matière (peu d'appels de dessin) ;
 * aucune lumière dynamique sur téléphone (les torches sont des halos).
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import * as W from './world.js';
import * as RT from './realtex.js';
import * as N from './npcs.js';
import { buildCaptain } from './forest.js';
import { buildCitizen } from './citykit.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, k) => a + (b - a) * k;
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
function rng(seed) { let s = seed >>> 0 || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const inRect = (r, x, z, m) => { m = m || 0; return x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m; };

/** Poisson doré (les 100 trésors à ramasser du château). */
export function fishGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0.3, 0);
  s.bezierCurveTo(0.22, 0.17, -0.06, 0.2, -0.16, 0.03);
  s.lineTo(-0.32, 0.17); s.lineTo(-0.28, 0); s.lineTo(-0.32, -0.17); s.lineTo(-0.16, -0.03);
  s.bezierCurveTo(-0.06, -0.2, 0.22, -0.17, 0.3, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.045, bevelSize: 0.035, bevelSegments: 2, curveSegments: 8 });
  g.center();
  return g;
}

// ---------------------------------------------------------------------------
// Petits outils de géométrie : fusion avec coordonnées de texture et couleurs
// ---------------------------------------------------------------------------
function mergeUV(list) {
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), c = new THREE.Color();
  const geos = list.map((it) => {
    const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone();
    m4.compose(new THREE.Vector3(it.x || 0, it.y || 0, it.z || 0), q.setFromEuler(e.set(it.rx || 0, it.ry || 0, it.rz || 0)),
      new THREE.Vector3(it.sx || 1, it.sy || it.sx || 1, it.sz || it.sx || 1));
    g.applyMatrix4(m4);
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color || it.color !== undefined) {
      c.set(it.color === undefined ? 0xffffff : it.color);
      const a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    return g;
  });
  let n = 0;
  for (const g of geos) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of geos) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3);
    uv.set(g.attributes.uv.array, o * 2); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  return out;
}
/** Boîte dont la texture garde la même échelle sur chaque face (tile = mètres par motif). */
function boxGeo(w, h, d, tile) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  return g;
}
function cylGeo(r0, r1, h, seg, tile, open) {
  const g = new THREE.CylinderGeometry(r0, r1, h, seg, 1, !!open);
  const uv = g.attributes.uv, k = (Math.PI * 2 * Math.max(r0, r1)) / tile;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * k, uv.getY(i) * h / tile);
  return g;
}
function planeGeo(w, d, tile) {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / tile, uv.getY(i) * d / tile);
  return g;
}

// ---------------------------------------------------------------------------
// Textures dessinées (rendu dessin animé, et quand les photos manquent)
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw, srgb) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
/** Grosses pierres taillées, joints clairs. */
function stoneTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    const r = rng(17);
    x.fillStyle = '#cbbba4'; x.fillRect(0, 0, w, h);
    const rows = 4, rh = h / rows;
    for (let j = 0; j < rows; j++) {
      let px = j % 2 ? -32 : 0;
      while (px < w) {
        const bw = 52 + r() * 36, v = 0.9 + r() * 0.16;
        x.fillStyle = `rgb(${Math.round(244 * v)},${Math.round(230 * v)},${Math.round(208 * v)})`;
        x.beginPath(); x.roundRect(px + 3, j * rh + 3, bw - 6, rh - 6, 7); x.fill();
        x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(px + 6, j * rh + 6, bw - 14, 6);
        x.fillStyle = 'rgba(120,90,60,0.12)'; x.fillRect(px + 4, j * rh + rh - 12, bw - 8, 7);
        px += bw;
      }
    }
    for (let i = 0; i < 1800; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '90,70,50' : '255,255,255'},0.05)`; x.fillRect(r() * w, r() * h, 2, 2); }
  });
}
function floorTexture() {
  return canvasTex(256, 256, (x, w, h) => {
    const r = rng(29);
    x.fillStyle = '#b8a48a'; x.fillRect(0, 0, w, h);
    const n = 4, s = w / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const v = 0.88 + r() * 0.18, warm = r() * 12;
      x.fillStyle = `rgb(${Math.round(236 * v + warm)},${Math.round(222 * v)},${Math.round(196 * v - warm)})`;
      x.beginPath(); x.roundRect(i * s + 3, j * s + 3, s - 6, s - 6, 6); x.fill();
    }
    // petites pattes gravées, ici et là
    x.fillStyle = 'rgba(150,120,90,0.25)';
    for (const [px, py] of [[s * 0.5, s * 1.5], [s * 2.5, s * 3.5]]) {
      x.beginPath(); x.ellipse(px, py + 6, 10, 8, 0, 0, 7); x.fill();
      for (const [dx, dy] of [[-11, -6], [-4, -12], [4, -12], [11, -6]]) { x.beginPath(); x.ellipse(px + dx, py + dy, 3.5, 4.5, 0, 0, 7); x.fill(); }
    }
    for (let i = 0; i < 1500; i++) { x.fillStyle = 'rgba(80,60,40,0.06)'; x.fillRect(r() * w, r() * h, 2, 2); }
  });
}
function roofTexture() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#d8d0dc'; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) for (let i = -1; i < 9; i++) {
      const cx = i * 16 + (j % 2) * 8, cy = j * 16;
      x.fillStyle = j % 2 ? '#ffffff' : '#ece4f0';
      x.beginPath(); x.arc(cx + 8, cy + 8, 9, 0, Math.PI); x.fill();
      x.strokeStyle = 'rgba(90,60,90,0.35)'; x.lineWidth = 1.5; x.beginPath(); x.arc(cx + 8, cy + 8, 9, 0, Math.PI); x.stroke();
    }
  });
}
function woodTexture() {
  return canvasTex(128, 128, (x, w, h) => {
    const r = rng(41);
    x.fillStyle = '#c8955a'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 4; i++) {
      x.fillStyle = `rgb(${190 + r() * 30 | 0},${132 + r() * 24 | 0},${78 + r() * 16 | 0})`; x.fillRect(i * 32 + 1, 0, 30, h);
      x.strokeStyle = 'rgba(90,50,20,0.25)'; for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(i * 32 + 4 + r() * 22, 0); x.lineTo(i * 32 + 4 + r() * 22, h); x.stroke(); }
      x.fillStyle = 'rgba(60,30,10,0.45)'; x.fillRect(i * 32, 0, 2, h);
    }
  });
}
function sisalTexture() {
  return canvasTex(64, 64, (x, w, h) => {
    x.fillStyle = '#d8b880'; x.fillRect(0, 0, w, h);
    for (let j = 0; j < 8; j++) { x.fillStyle = j % 2 ? '#c8a468' : '#e6c890'; x.fillRect(0, j * 8, w, 6); x.fillStyle = 'rgba(110,80,40,0.3)'; for (let i = 0; i < 8; i++) x.fillRect(i * 8 + (j % 2) * 4, j * 8, 1.5, 6); }
  });
}
function yarnTexture() {
  return canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    x.lineWidth = 3;
    for (let k = 0; k < 3; k++) {
      x.strokeStyle = ['rgba(0,0,0,0.16)', 'rgba(0,0,0,0.08)', 'rgba(255,255,255,0.6)'][k];
      for (let i = -4; i < 12; i++) { x.beginPath(); for (let px = 0; px <= w; px += 4) { const py = i * 12 + k * 4 + Math.sin(px * 0.06 + i) * 6 + px * 0.25 * (k === 1 ? -1 : 1); if (px) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); }
    }
  });
}
function bannerTexture(bg) {
  return canvasTex(128, 256, (x, w, h) => {
    x.fillStyle = bg; x.fillRect(0, 0, w, h);
    x.fillStyle = 'rgba(0,0,0,0.12)'; x.fillRect(0, 0, w, 18);
    // bord doré et pointe
    x.fillStyle = '#ffd23a'; x.fillRect(0, 18, w, 8); x.fillRect(0, 18, 8, h); x.fillRect(w - 8, 18, 8, h);
    x.clearRect(0, h - 40, w, 40);
    x.fillStyle = bg; x.beginPath(); x.moveTo(0, h - 40); x.lineTo(w / 2, h - 4); x.lineTo(w, h - 40); x.fill();
    x.fillStyle = '#ffd23a'; x.beginPath(); x.moveTo(0, h - 48); x.lineTo(w / 2, h - 12); x.lineTo(w, h - 48); x.lineTo(w, h - 40); x.lineTo(w / 2, h - 4); x.lineTo(0, h - 40); x.fill();
    // l'emblème : un poisson doré dans un rond
    x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(w / 2, 110, 40, 0, 7); x.fill();
    x.fillStyle = '#ffb820';
    x.beginPath(); x.ellipse(w / 2 + 6, 110, 24, 14, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(w / 2 - 14, 110); x.lineTo(w / 2 - 32, 96); x.lineTo(w / 2 - 32, 124); x.fill();
    x.fillStyle = '#5a3010'; x.beginPath(); x.arc(w / 2 + 20, 106, 3, 0, 7); x.fill();
  });
}
function carpetTexture() {
  return canvasTex(64, 128, (x, w, h) => {
    x.fillStyle = '#c83848'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#ffd23a'; x.fillRect(4, 0, 5, h); x.fillRect(w - 9, 0, 5, h);
    x.fillStyle = 'rgba(255,220,120,0.35)';
    for (let j = 0; j < 4; j++) { x.beginPath(); x.moveTo(w / 2, j * 32 + 4); x.lineTo(w / 2 + 12, j * 32 + 16); x.lineTo(w / 2, j * 32 + 28); x.lineTo(w / 2 - 12, j * 32 + 16); x.fill(); }
  });
}
function pawTexture(col, ink) {
  return canvasTex(128, 128, (x) => {
    x.fillStyle = col; x.fillRect(0, 0, 128, 128);
    x.fillStyle = ink;
    x.beginPath(); x.ellipse(64, 78, 24, 20, 0, 0, 7); x.fill();
    for (const [px, py] of [[32, 50], [50, 32], [78, 32], [96, 50]]) { x.beginPath(); x.ellipse(px, py, 10, 12, 0, 0, 7); x.fill(); }
  });
}
function pennantTexture() {
  return canvasTex(128, 64, (x) => {
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, 128, 64);
    x.fillStyle = '#7a4ad8'; x.fillRect(0, 0, 128, 9); x.fillRect(0, 55, 128, 9);
    x.fillStyle = '#ffb820';
    x.beginPath(); x.ellipse(68, 32, 18, 10, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(54, 32); x.lineTo(40, 22); x.lineTo(40, 42); x.fill();
  });
}

// ---------------------------------------------------------------------------
export function buildCastle(game) {
  const sc = game.scene, S = L, lite = game.lite;
  const moving = [], chars = [];
  const save = () => game.save;
  const cs = () => { const s = save(); if (!s.castle) s.castle = {}; const k = s.castle; if (k.cp === undefined) k.cp = 0; return k; };
  const real = W.LOOK.real, photos = real && RT.hasPhotos();
  const FL = S.FLOOR, TOPY = S.TOP;

  // --- matières ----------------------------------------------------------------------
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ vertexColors: true, roughness: 0.9 }, o || {}));
  let stoneMat, floorMat, roofMat, woodMat;
  if (photos) {
    // (les pierres restent claires et dorées : un château de livre d'images)
    // (pierres, dalles et tuiles restent claires et colorées : un château de livre d'images ; le bois est photographié)
    const st = stoneTexture(), fl = floorTexture(), rf = roofTexture(), wd = RT.photo('brown_planks_03', 1, 1);
    stoneMat = std({ map: st, normalMap: RT.normalFor(st, 3), roughness: 0.92 });
    floorMat = std({ map: fl, normalMap: RT.normalFor(fl, 2), roughness: 0.85 });
    roofMat = std({ map: rf, normalMap: RT.normalFor(rf, 2), roughness: 0.7 });
    woodMat = std({ map: wd.map, normalMap: wd.normalMap, roughness: 0.85 });
  } else {
    const st = stoneTexture(), fl = floorTexture(), rf = roofTexture(), wd = woodTexture();
    stoneMat = std({ map: st, normalMap: real ? RT.normalFor(st, 3) : null, roughness: 0.92 });
    floorMat = std({ map: fl, normalMap: real ? RT.normalFor(fl, 2) : null, roughness: 0.85 });
    roofMat = std({ map: rf, roughness: 0.7 });
    woodMat = std({ map: wd, roughness: 0.85 });
  }
  const paintMat = std({ roughness: 0.8 });                                // couleurs unies (sommets)
  const softMat = std({ roughness: 1 });                                   // tissus, coussins
  const goldMat = M.mat(0xffc830, { metalness: 0.75, roughness: 0.3, emissive: 0x5a3a00, emissiveIntensity: 0.4 });
  const sisalMat = std({ map: sisalTexture(), roughness: 1 });
  const yarnTex = yarnTexture();
  const addMesh = (geo, mat, cast, recv) => { const m = new THREE.Mesh(geo, mat); m.castShadow = cast !== false; m.receiveShadow = recv !== false; sc.add(m); return m; };

  // --- murs, créneaux, tours --------------------------------------------------------------
  const stone = [], roofs = [], paint = [], soft = [], wood = [], sisal = [], gold = [];
  const WALL_COL = { wall: 0xfbead2, inner: 0xf8e2d6, keep: 0xf0dcc2, parapet: 0xfbead2, throne: 0xfff0e2 };
  for (const { c, look } of S.walls) {
    const h = c.y1 - c.y0, col = WALL_COL[look] || 0xfbead2;
    stone.push({ geo: boxGeo(c.w, h, c.d, 3), x: c.x, y: c.y0 + h / 2, z: c.z, color: col });
    // socle moussu au ras de l'eau (murs extérieurs)
    if (c.y0 < 0) stone.push({ geo: boxGeo(c.w + 0.4, 1.6, c.d + 0.4, 3), x: c.x, y: -0.4, z: c.z, color: 0xb8b090 });
    // créneaux
    if (look === 'keep' || look === 'parapet') continue;
    const long = c.w > c.d, len = long ? c.w : c.d, n = Math.floor(len / 1.9);
    const mw = 0.95, th = (long ? c.d : c.w) * 0.8;
    for (let i = 0; i < n; i++) {
      const o = -len / 2 + (i + 0.5) * (len / n);
      stone.push({ geo: boxGeo(long ? mw : th, 0.9, long ? th : mw, 3), x: c.x + (long ? o : 0), y: c.y1 + 0.45, z: c.z + (long ? 0 : o), color: col });
    }
  }
  // le linteau et l'arche de la porte d'entrée
  stone.push({ geo: boxGeo(6.2, S.FLOOR + 6.5 - (FL + 5.2), 2, 3), x: 0, y: (FL + 5.2 + S.FLOOR + 6.5) / 2, z: 12.2, color: 0xfbead2 });
  {
    const arch = new THREE.TorusGeometry(2.9, 0.32, 8, 20, Math.PI);
    stone.push({ geo: arch, x: 0, y: FL + 2.3, z: 13.25, color: 0xf0d8b8 });
    stone.push({ geo: arch, x: 0, y: FL + 2.3, z: 11.15, color: 0xf0d8b8 });
  }
  // linteaux des passages intérieurs (le collider existe déjà)
  for (const z of [-14, -34]) stone.push({ geo: boxGeo(5, S.FLOOR + 5.5 - (FL + 4.6), 1.6, 3), x: 0, y: (FL + 4.6 + FL + 5.5) / 2, z, color: 0xf8e2d6 });
  // la salle du trône est ouverte sur la terrasse : une colonnade et sa grande poutre
  for (const x of S.THRONE_COLS) {
    stone.push({ geo: cylGeo(0.55, 0.62, 4.9, 14, 2), x, y: TOPY + 1.95, z: -54.6, color: 0xfff0e2 });
    stone.push({ geo: boxGeo(1.5, 0.4, 1.5, 2), x, y: TOPY - 0.3, z: -54.6, color: 0xf0dcc2 });
    stone.push({ geo: boxGeo(1.4, 0.35, 1.4, 2), x, y: TOPY + 4.3, z: -54.6, color: 0xf0dcc2 });
  }
  stone.push({ geo: boxGeo(28.4, 0.7, 1.2, 3), x: 0, y: TOPY + 4.8, z: -54.6, color: 0xfbead2 });
  for (let i = 0; i < 14; i++) stone.push({ geo: boxGeo(0.95, 0.8, 1.0, 3), x: -13.2 + i * (26.4 / 13), y: TOPY + 5.55, z: -54.6, color: 0xfbead2 });
  // tours : fût de pierre, couronne de créneaux, toit pointu ou oreilles de chat
  const ROOF_COLS = [0xf08ab0, 0xb090e0, 0xf09a78, 0x8ab0f0];
  S.TOWERS.forEach((T, i) => {
    const h = T.h - S.MOAT_FLOOR, seg = lite ? 14 : 22;
    stone.push({ geo: cylGeo(T.r, T.r * 1.06, h, seg, 3), x: T.x, y: S.MOAT_FLOOR + h / 2, z: T.z, color: 0xfbead2 });
    stone.push({ geo: cylGeo(T.r + 0.35, T.r + 0.35, 0.6, seg, 3), x: T.x, y: T.h - 0.3, z: T.z, color: 0xf0d8b8 });
    for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2; stone.push({ geo: boxGeo(0.8, 0.8, 0.5, 3), x: T.x + Math.cos(a) * (T.r + 0.1), y: T.h + 0.4, z: T.z + Math.sin(a) * (T.r + 0.1), ry: -a, color: 0xfbead2 }); }
    // fenêtres
    for (let k = 0; k < 2; k++) {
      const a = Math.PI / 2 + (k ? 0.9 : -0.9) * (T.ears ? 0 : 1);
      if (T.ears && k) break;
      const wy = T.h - 3.2 - k * 1.2;
      paint.push({ geo: boxGeo(0.7, 1.2, 0.2, 1), x: T.x + Math.cos(a) * (T.r + 0.02), y: wy, z: T.z + Math.sin(a) * (T.r + 0.02), ry: -a + Math.PI / 2, color: 0x3a2a40 });
      paint.push({ geo: new THREE.CylinderGeometry(0.35, 0.35, 0.2, 10, 1, false, 0, Math.PI), x: T.x + Math.cos(a) * (T.r + 0.02), y: wy + 0.6, z: T.z + Math.sin(a) * (T.r + 0.02), rx: Math.PI / 2, ry: -a + Math.PI / 2, rz: Math.PI / 2, color: 0x3a2a40 });
    }
    const rc = ROOF_COLS[i % ROOF_COLS.length];
    if (!T.ears) {
      roofs.push({ geo: new THREE.ConeGeometry(T.r * 1.3, T.r * 1.9, seg), x: T.x, y: T.h + 0.8 + T.r * 0.95, z: T.z, color: rc });
      // fanion
      paint.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), x: T.x, y: T.h + 0.8 + T.r * 1.9 + 0.7, z: T.z, color: 0x5a4030 });
      soft.push({ geo: new THREE.ConeGeometry(0.35, 1.1, 3), x: T.x + 0.5, y: T.h + 0.8 + T.r * 1.9 + 1.2, z: T.z, rz: -Math.PI / 2, color: 0xff5a7a });
    } else {
      // toit bombé et deux oreilles de chat (l'intérieur est rose)
      roofs.push({ geo: new THREE.SphereGeometry(T.r * 1.18, seg, 10, 0, Math.PI * 2, 0, Math.PI / 2), x: T.x, y: T.h + 0.8, z: T.z, sy: 0.55, color: rc });
      const face = 1;                                   // (elles regardent toutes vers la cour)
      for (const sx of [-1, 1]) {
        const ex = T.x + sx * T.r * 0.55, ey = T.h + 0.8 + T.r * 0.75;
        roofs.push({ geo: new THREE.ConeGeometry(T.r * 0.55, T.r * 1.25, 4), x: ex, y: ey, z: T.z, ry: Math.PI / 4, rz: -sx * 0.32, color: rc });
        soft.push({ geo: new THREE.ConeGeometry(T.r * 0.3, T.r * 0.85, 3), x: ex - sx * 0.05, y: ey - T.r * 0.08, z: T.z + face * T.r * 0.28, rz: -sx * 0.32, color: 0xffa8c0 });
      }
      // deux yeux ronds et dorés : la tour est un chat qui regarde
      for (const sx of [-1, 1]) gold.push({ geo: new THREE.SphereGeometry(T.r * 0.16, 12, 8), x: T.x + sx * T.r * 0.38, y: T.h - 1.3, z: T.z + face * (T.r * 0.97), sz: 0.4 });
    }
  });
  // --- sol du château : dalles (le jardin garde sa pelouse) -------------------------------
  const floors = [];
  const slab = (x0, x1, z0, z1, y) => floors.push({ geo: planeGeo(x1 - x0, z1 - z0, 4), x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, color: 0xffffff });
  slab(-22.5, 22.5, -14.6, 13.4, FL + 0.025);                         // cour (et le passage de la porte)
  slab(-22.5, 22.5, -34.6, -13.4, FL + 0.03);                          // salle du point rouge
  slab(-22.5, 22.5, -36.5, -33.4, FL + 0.025);                         // jardin : bordure dallée
  slab(-22.5, 22.5, -51.6, -49.5, FL + 0.025);
  slab(-22.5, -17, -49.5, -36.5, FL + 0.025);
  slab(17, 22.5, -49.5, -36.5, FL + 0.025);
  slab(-22.5, 22.5, -72.5, -51.2, TOPY + 0.025);                       // terrasse et salle du trône
  addMesh(mergeUV(floors), floorMat, false, true);
  // tapis rouge jusqu'au trône, et tapis rond sous l'Arbre à Chats
  {
    const cm = new THREE.MeshStandardMaterial({ map: carpetTexture(), roughness: 1 });
    const cp = new THREE.Mesh(planeGeo(3.2, 12.4, 3.2), cm);
    cp.position.set(0, TOPY + 0.05, -60.4); cp.receiveShadow = true; sc.add(cp);
    cp.material.map.repeat.set(1, 1);
    const rug = new THREE.Mesh(new THREE.CircleGeometry(5.6, 40), new THREE.MeshStandardMaterial({ color: 0xe8b0c8, roughness: 1 }));
    rug.rotation.x = -Math.PI / 2; rug.position.set(S.TREE.x, FL + 0.04, S.TREE.z); rug.receiveShadow = true; sc.add(rug);
    const rug2 = new THREE.Mesh(new THREE.RingGeometry(5.0, 5.6, 40), new THREE.MeshStandardMaterial({ color: 0xffd23a, roughness: 1 }));
    rug2.rotation.x = -Math.PI / 2; rug2.position.set(S.TREE.x, FL + 0.05, S.TREE.z); sc.add(rug2);
  }
  // bordure de pierre au bord extérieur des douves (laisse passer le pont-levis)
  {
    const Mo = S.MOAT, y = FL + 0.1;
    const curb = (x0, z0, x1, z1) => stone.push({ geo: boxGeo(Math.abs(x1 - x0) || 0.8, 0.5, Math.abs(z1 - z0) || 0.8, 2), x: (x0 + x1) / 2, y, z: (z0 + z1) / 2, color: 0xe0d0b8 });
    curb(Mo.x0 - 0.4, Mo.z1 + 0.4, -2.6, Mo.z1 + 0.4); curb(2.6, Mo.z1 + 0.4, Mo.x1 + 0.4, Mo.z1 + 0.4);
    curb(Mo.x0 - 0.4, Mo.z0 - 0.4, Mo.x1 + 0.4, Mo.z0 - 0.4);
    curb(Mo.x0 - 0.4, Mo.z0 - 0.4, Mo.x0 - 0.4, Mo.z1 + 0.4); curb(Mo.x1 + 0.4, Mo.z0 - 0.4, Mo.x1 + 0.4, Mo.z1 + 0.4);
  }

  // --- décor de la cour, de la salle et du jardin -----------------------------------------
  // la fontaine au poisson
  const F = S.FOUNTAIN;
  stone.push({ geo: cylGeo(F.r, F.r + 0.15, F.h, 28, 2), x: F.x, y: FL + F.h / 2, z: F.z, color: 0xf4e4cc });
  stone.push({ geo: cylGeo(0.5, 0.65, 1.8, 14, 2), x: F.x, y: FL + 0.9, z: F.z, color: 0xf4e4cc });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(F.r - 0.25, 32), new THREE.MeshStandardMaterial({ color: 0x5ac8e8, roughness: 0.1, metalness: 0.1, emissive: 0x0a3a5a, emissiveIntensity: 0.4 }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(F.x, FL + F.h - 0.12, F.z); pool.userData.noOutline = true; sc.add(pool);
  const statue = new THREE.Mesh(fishGeometry(), goldMat);
  statue.scale.setScalar(3.2); statue.position.set(F.x, FL + 2.4, F.z); statue.rotation.set(0, 0.6, 0.5); statue.castShadow = true; sc.add(statue);
  // poteaux griffoirs (corde), un jouet au bout d'une ficelle
  for (const p of S.POSTS) {
    sisal.push({ geo: cylGeo(0.6, 0.6, p.h, 14, 1.2), x: p.x, y: p.y + p.h / 2, z: p.z });
    soft.push({ geo: cylGeo(0.95, 0.95, 0.35, 18, 1), x: p.x, y: p.y + p.h + 0.17, z: p.z, color: 0xa86ad8 });
    soft.push({ geo: cylGeo(0.95, 1.05, 0.3, 18, 1), x: p.x, y: p.y + 0.15, z: p.z, color: 0xa86ad8 });
    paint.push({ geo: new THREE.CylinderGeometry(0.015, 0.015, 1.4, 4), x: p.x + 0.85, y: p.y + p.h - 0.55, z: p.z, color: 0xf0f0f0 });
    soft.push({ geo: new THREE.SphereGeometry(0.2, 10, 8), x: p.x + 0.85, y: p.y + p.h - 1.3, z: p.z, color: 0xff6ab0 });
  }
  // pelotes géantes (décor) et coussins
  const yarnMat = new THREE.MeshStandardMaterial({ map: yarnTex, vertexColors: true, roughness: 1 });
  const yarnDeco = [];
  for (const y of S.YARNS) {
    yarnDeco.push({ geo: new THREE.SphereGeometry(y.r, lite ? 16 : 24, lite ? 12 : 16), x: y.x, y: y.y + y.r * 0.95, z: y.z, color: y.col });
    yarnDeco.push({ geo: new THREE.TorusGeometry(y.r * 0.98, 0.05, 6, 30), x: y.x, y: y.y + y.r * 0.95, z: y.z, rx: 1.1, ry: y.x, color: y.col });
    yarnDeco.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, 2.4, 5), x: y.x + y.r * 0.8 + 0.8, y: y.y + 0.05, z: y.z + 0.3, rz: Math.PI / 2, ry: 0.4, color: y.col });
  }
  addMesh(mergeUV(yarnDeco), yarnMat);
  for (const c of S.CUSHIONS) {
    soft.push({ geo: new THREE.SphereGeometry(c.r, 18, 10), x: c.x, y: c.y + 0.38, z: c.z, sy: 0.32 / c.r * 1.25, color: c.col });
    soft.push({ geo: new THREE.SphereGeometry(c.r * 0.7, 16, 8), x: c.x + 0.2, y: c.y + 0.75, z: c.z - 0.1, sy: 0.26 / c.r * 1.4, color: new THREE.Color(c.col).lerp(new THREE.Color(0xffffff), 0.35).getHex() });
    for (const sx of [-1, 1]) soft.push({ geo: new THREE.SphereGeometry(0.16, 8, 6), x: c.x + sx * c.r * 0.9, y: c.y + 0.4, z: c.z, color: 0xffd23a });
  }
  // la grosse dalle des remparts (on y grimpe avec la pelote)
  const LE = S.LEDGE;
  stone.push({ geo: boxGeo(LE.x1 - LE.x0, LE.top - FL + 1, LE.z1 - LE.z0, 3), x: (LE.x0 + LE.x1) / 2, y: (LE.top + FL - 1) / 2, z: (LE.z0 + LE.z1) / 2, color: 0xf2dcc0 });
  stone.push({ geo: boxGeo(LE.x1 - LE.x0 + 0.3, 0.35, LE.z1 - LE.z0 + 0.3, 3), x: (LE.x0 + LE.x1) / 2, y: LE.top - 0.15, z: (LE.z0 + LE.z1) / 2, color: 0xe8ccb0 });
  // l'empreinte où caler la pelote
  const slotMark = new THREE.Mesh(new THREE.RingGeometry(1.0, 1.45, 32), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.6, depthWrite: false }));
  slotMark.rotation.x = -Math.PI / 2; slotMark.position.set(S.SLOT.x, FL + 0.06, S.SLOT.z); slotMark.userData.noOutline = true; sc.add(slotMark);
  // le projecteur du point rouge (une grosse lampe-jouet sur son support)
  const PJ = S.PROJECTOR;
  paint.push({ geo: boxGeo(0.8, 2.2, 0.8, 1), x: PJ.x - 0.2, y: FL + 1.1, z: PJ.z, color: 0x8a5a3a });
  paint.push({ geo: new THREE.CylinderGeometry(0.42, 0.5, 1.6, 16), x: PJ.x + 0.35, y: PJ.y, z: PJ.z, rz: Math.PI / 2, color: 0xe83a4a });
  paint.push({ geo: new THREE.CylinderGeometry(0.52, 0.52, 0.25, 16), x: PJ.x + 1.15, y: PJ.y, z: PJ.z, rz: Math.PI / 2, color: 0xfff4e0 });
  for (const sx of [-1, 1]) roofs.push({ geo: new THREE.ConeGeometry(0.2, 0.4, 4), x: PJ.x + 0.1, y: PJ.y + 0.48, z: PJ.z + sx * 0.22, color: 0xe83a4a });
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.34, 18), new THREE.MeshBasicMaterial({ color: 0xff3040 }));
  lens.position.set(PJ.x + 1.29, PJ.y, PJ.z); lens.rotation.y = Math.PI / 2; lens.userData.noOutline = true; sc.add(lens);
  // le grand coussin de sieste devant la porte
  soft.push({ geo: new THREE.SphereGeometry(3.2, 24, 10), x: 0, y: FL + 0.2, z: -31.6, sy: 0.12, sz: 0.55, color: 0xf08ab0 });
  // l'Arbre à Chats : grand poteau de corde, plateaux moquettés, hamac, perchoir, passerelle
  const TR = S.TREE;
  sisal.push({ geo: cylGeo(TR.r, TR.r * 1.1, TOPY - 0.5 - FL, 18, 1.2), x: TR.x, y: (TOPY - 0.5 + FL) / 2, z: TR.z });
  sisal.push({ geo: cylGeo(0.45, 0.45, S.PERCH.top - TOPY, 12, 1.2), x: TR.x, y: (S.PERCH.top + TOPY) / 2 - 0.3, z: TR.z });
  const CARPETS = [0xf4b0c8, 0xb8d8f8, 0xfff0b0, 0xc8f0c0, 0xe0c8f8, 0xffc8a8, 0xb8f0e8];
  S.catTree.forEach((p, i) => {
    soft.push({ geo: cylGeo(p.r, p.r, 0.4, 20, 1), x: p.x, y: p.top - 0.2, z: p.z, color: CARPETS[i % CARPETS.length] });
    // bras vers le poteau
    const dx = TR.x - p.x, dz = TR.z - p.z, d = Math.hypot(dx, dz);
    wood.push({ geo: boxGeo(0.35, 0.3, d, 1), x: (p.x + TR.x) / 2, y: p.top - 0.55, z: (p.z + TR.z) / 2, ry: Math.atan2(dx, dz) });
    // une petite souris en peluche qui pend
    paint.push({ geo: new THREE.CylinderGeometry(0.012, 0.012, 0.9, 4), x: p.x + Math.cos(p.a) * 0.9, y: p.top - 0.85, z: p.z + Math.sin(p.a) * 0.9, color: 0xf0f0f0 });
    soft.push({ geo: new THREE.SphereGeometry(0.17, 10, 8), x: p.x + Math.cos(p.a) * 0.9, y: p.top - 1.35, z: p.z + Math.sin(p.a) * 0.9, sz: 1.5, color: [0xb0b0c0, 0xffd23a, 0xff8ab0][i % 3] });
  });
  const HM = S.HAMMOCK;
  soft.push({ geo: cylGeo(HM.r, HM.r * 0.9, 0.5, 26, 1), x: HM.x, y: HM.top - 0.25, z: HM.z, color: 0xf08ab0 });
  soft.push({ geo: new THREE.TorusGeometry(HM.r, 0.18, 8, 30), x: HM.x, y: HM.top, z: HM.z, rx: Math.PI / 2, color: 0xffd23a });
  soft.push({ geo: cylGeo(S.PERCH.r, S.PERCH.r, 0.35, 20, 1), x: S.PERCH.x, y: S.PERCH.top - 0.17, z: S.PERCH.z, color: 0xffd23a });
  soft.push({ geo: new THREE.TorusGeometry(S.PERCH.r, 0.12, 8, 24), x: S.PERCH.x, y: S.PERCH.top, z: S.PERCH.z, rx: Math.PI / 2, color: 0xf08ab0 });
  const PL = S.PLANK, plen = PL.z0 - PL.z1;
  for (let i = 0; i < 9; i++) wood.push({ geo: boxGeo(PL.w, 0.18, plen / 9 * 0.86, 1), x: PL.x + (i % 2 ? 0.05 : -0.05), y: PL.top - 0.09, z: PL.z0 - plen / 9 * (i + 0.5) });
  for (const sx of [-1, 1]) {
    paint.push({ geo: new THREE.CylinderGeometry(0.05, 0.05, plen, 5), x: PL.x + sx * (PL.w / 2 + 0.1), y: PL.top + 1.0, z: (PL.z0 + PL.z1) / 2, rx: Math.PI / 2, color: 0xe8d8b0 });
    for (const z of [PL.z0 - 0.2, (PL.z0 + PL.z1) / 2, PL.z1 + 0.2]) wood.push({ geo: boxGeo(0.14, 1.1, 0.14, 1), x: PL.x + sx * (PL.w / 2 + 0.1), y: PL.top + 0.5, z });
  }
  // buissons ronds du jardin
  for (const [x, z, r] of [[-19.5, -37.5, 1.2], [19.5, -37.5, 1.1], [-19.6, -49.4, 1.3], [19.6, -49.6, 1.2], [-8, -50, 0.9], [8, -50.2, 1.0]]) {
    paint.push({ geo: new THREE.IcosahedronGeometry(r, 1), x, y: FL + r * 0.7, z, color: 0x5aa83c });
    paint.push({ geo: new THREE.IcosahedronGeometry(r * 0.7, 1), x: x + r * 0.5, y: FL + r * 0.5, z: z + 0.3, color: 0x6ab848 });
  }
  // le trône : estrade, siège, grand dossier à oreilles
  const D = S.DAIS, SE = S.SEAT;
  paint.push({ geo: boxGeo(D.w, D.top - TOPY + 0.5, D.d, 1), x: D.x, y: (D.top + TOPY - 0.5) / 2, z: D.z, color: 0xb83040 });
  gold.push({ geo: boxGeo(D.w + 0.1, 0.12, D.d + 0.1, 1), x: D.x, y: D.top - 0.04, z: D.z });
  soft.push({ geo: boxGeo(SE.w, SE.top - D.top + 0.2, SE.d, 1), x: SE.x, y: (SE.top + D.top - 0.2) / 2, z: SE.z, color: 0x7a4ad8 });
  soft.push({ geo: new THREE.SphereGeometry(1.1, 18, 8), x: SE.x, y: SE.top + 0.05, z: SE.z, sy: 0.18, color: 0xb08af0 });
  paint.push({ geo: boxGeo(3.2, 3.6, 0.8, 1), x: 0, y: D.top + 1.6, z: -70.3, color: 0x7a4ad8 });
  for (const sx of [-1, 1]) {
    gold.push({ geo: new THREE.ConeGeometry(0.7, 1.4, 4), x: sx * 1.05, y: D.top + 3.9, z: -70.3, ry: Math.PI / 4, rz: -sx * 0.25 });
    paint.push({ geo: boxGeo(0.4, 1.2, SE.d, 1), x: sx * (SE.w / 2 + 0.1), y: SE.top + 0.3, z: SE.z, color: 0x7a4ad8 });
    gold.push({ geo: new THREE.SphereGeometry(0.28, 12, 8), x: sx * (SE.w / 2 + 0.1), y: SE.top + 0.95, z: SE.z + 0.6 });
  }
  gold.push({ geo: new THREE.TorusGeometry(0.75, 0.12, 8, 24), x: 0, y: D.top + 2.4, z: -69.85 });
  // statues de chats assis, sur la terrasse
  for (const [x, z] of [[-17.5, -55], [17.5, -55], [-17.5, -68], [17.5, -68]]) {
    stone.push({ geo: boxGeo(1.6, 1.0, 1.6, 2), x, y: TOPY + 0.5, z, color: 0xe8d8c0 });
    stone.push({ geo: new THREE.SphereGeometry(0.7, 14, 10), x, y: TOPY + 1.6, z, sy: 1.25, color: 0xf4e8d8 });
    stone.push({ geo: new THREE.SphereGeometry(0.48, 14, 10), x, y: TOPY + 2.75, z: z + (z > -60 ? 0.12 : -0.12), color: 0xf4e8d8 });
    for (const sx of [-1, 1]) stone.push({ geo: new THREE.ConeGeometry(0.17, 0.4, 4), x: x + sx * 0.28, y: TOPY + 3.2, z, rz: -sx * 0.25, color: 0xf4e8d8 });
  }

  // --- bannières à poisson et torches -----------------------------------------------------
  const banners = [];
  const BANNER_COLS = ['#d83a4a', '#4a6ad8', '#8a4ad8', '#2a9a7a'];
  const banner = (x, y, z, ry, i, s) => banners.push({ geo: new THREE.PlaneGeometry(1.5, 3), x, y, z, ry, sx: s || 1, i: i % BANNER_COLS.length });
  // façade (dehors, de part et d'autre de la porte), cour, salle, jardin, salle du trône
  banner(-9, FL + 3.6, 13.3, 0, 0, 1.2); banner(9, FL + 3.6, 13.3, 0, 1, 1.2);
  banner(-8, FL + 3.4, 11.15, Math.PI, 2); banner(8, FL + 3.4, 11.15, Math.PI, 3);
  banner(-6, FL + 3.0, -13.15, 0, 1); banner(6, FL + 3.0, -13.15, 0, 0);
  banner(-21.15, FL + 3.4, -19, Math.PI / 2, 0); banner(-21.15, FL + 3.4, -29, Math.PI / 2, 2); banner(21.15, FL + 3.4, -24, -Math.PI / 2, 1);
  banner(-6, FL + 3.0, -33.15, 0, 3); banner(6, FL + 3.0, -33.15, 0, 2);
  banner(-6, FL + 3.0, -34.85, Math.PI, 0); banner(6, FL + 3.0, -34.85, Math.PI, 1);
  banner(-4.5, TOPY + 3.0, -71.1, 0, 0, 1.3); banner(4.5, TOPY + 3.0, -71.1, 0, 0, 1.3);
  banner(-13.35, TOPY + 2.8, -60, Math.PI / 2, 1); banner(13.35, TOPY + 2.8, -60, -Math.PI / 2, 2);
  banner(-13.35, TOPY + 2.8, -66.5, Math.PI / 2, 3); banner(13.35, TOPY + 2.8, -66.5, -Math.PI / 2, 1);
  {
    BANNER_COLS.forEach((bg, i) => {
      const list = banners.filter(b => b.i === i);
      if (!list.length) return;
      const bm = new THREE.MeshStandardMaterial({ map: bannerTexture(bg), roughness: 0.9, side: THREE.DoubleSide, alphaTest: 0.5 });
      const m = new THREE.Mesh(mergeUV(list), bm); m.receiveShadow = true; m.userData.noOutline = true; sc.add(m);
    });
  }
  const TORCHES = [
    [-3.6, FL + 3.0, 13.4, 0], [3.6, FL + 3.0, 13.4, 0],
    [-3.6, FL + 3.0, 11.2, Math.PI], [3.6, FL + 3.0, 11.2, Math.PI],
    [-3.3, FL + 2.8, -13.1, 0], [3.3, FL + 2.8, -13.1, 0],
    [-21.0, FL + 2.8, -24, Math.PI / 2], [21.0, FL + 2.8, -19, -Math.PI / 2], [21.0, FL + 2.8, -29, -Math.PI / 2],
    [-3.3, FL + 2.8, -33.1, 0], [3.3, FL + 2.8, -33.1, 0],
    [-13.2, TOPY + 2.6, -57, Math.PI / 2], [13.2, TOPY + 2.6, -57, -Math.PI / 2], [-13.2, TOPY + 2.6, -63.3, Math.PI / 2], [13.2, TOPY + 2.6, -63.3, -Math.PI / 2],
    [-2.4, TOPY + 2.6, -70.9, 0], [2.4, TOPY + 2.6, -70.9, 0],
  ];
  const flames = [];
  for (const [x, y, z, ry] of TORCHES) {
    const fx = Math.sin(ry) * 0.35, fz = Math.cos(ry) * 0.35;
    paint.push({ geo: boxGeo(0.12, 0.6, 0.12, 1), x: x + fx * 0.5, y: y - 0.35, z: z + fz * 0.5, color: 0x3a2a20 });
    gold.push({ geo: new THREE.CylinderGeometry(0.2, 0.1, 0.3, 10), x: x + fx, y, z: z + fz });
    flames.push({ geo: new THREE.ConeGeometry(0.14, 0.45, 8), x: x + fx, y: y + 0.32, z: z + fz });
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb040 });
  const flameMesh = new THREE.Mesh(mergeUV(flames), flameMat); flameMesh.userData.noOutline = true; sc.add(flameMesh);
  const glowGeo = new THREE.BufferGeometry();
  glowGeo.setAttribute('position', new THREE.Float32BufferAttribute(TORCHES.flatMap(([x, y, z, ry]) => [x + Math.sin(ry) * 0.35, y + 0.35, z + Math.cos(ry) * 0.35]), 3));
  const glowMat = new THREE.PointsMaterial({ map: M.glowTexture(), color: 0xffa040, size: 2.6, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const glow = new THREE.Points(glowGeo, glowMat); glow.renderOrder = 4; glow.userData.noOutline = true; sc.add(glow);
  // ordinateur : deux lumières chaudes (salle du trône, salle du point rouge) ; téléphone : aucune
  const lamps = [];
  if (!lite) for (const [x, y, z] of [[0, TOPY + 4, -62], [0, FL + 4, -24]]) { const pl = new THREE.PointLight(0xffb060, 14, 22, 1.6); pl.position.set(x, y, z); sc.add(pl); lamps.push(pl); }
  // guirlandes de fanions dans la salle du point rouge (et, pour la fête, dans la salle du trône)
  const flagsets = [];
  const bunting = (x0, z0, x1, z1, y, sag, n, out) => {
    const pos = [], col = [], c = new THREE.Color(), cols = [0xff5a7a, 0xffd23a, 0x5ac8ff, 0x8ae05a, 0xc88aff];
    for (let i = 0; i < n; i++) {
      const k0 = i / n, k1 = (i + 0.7) / n, km = (i + 0.35) / n;
      const p = (k) => [lerp(x0, x1, k), y - Math.sin(k * Math.PI) * sag, lerp(z0, z1, k)];
      const a = p(k0), b = p(k1), m = p(km);
      pos.push(...a, ...b, m[0], m[1] - 0.55, m[2]);
      c.set(cols[i % cols.length]); for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
    m.userData.noOutline = true; sc.add(m);
    if (out) out.push(m);
    return m;
  };
  for (const z of [-18.5, -24, -29.5]) bunting(-21, z, 21, z, FL + 5.2, 1.2, 24);
  const partyDeco = [];
  for (const z of [-58, -62, -66]) bunting(-13.2, z, 13.2, z, TOPY + 4.2, 1.0, 18, partyDeco);
  bunting(-13.2, -56, 13.2, -69, TOPY + 4.3, 1.4, 22, partyDeco);
  bunting(13.2, -56, -13.2, -69, TOPY + 4.3, 1.4, 22, partyDeco);

  // tout le décor fixe, fusionné par matière
  addMesh(mergeUV(stone), stoneMat);
  addMesh(mergeUV(roofs), roofMat);
  addMesh(mergeUV(paint), paintMat);
  addMesh(mergeUV(soft), softMat);
  addMesh(mergeUV(wood), woodMat);
  addMesh(mergeUV(sisal), sisalMat);
  addMesh(mergeUV(gold), goldMat);

  // --- le pont-levis --------------------------------------------------------------------------
  const DB = S.DRAWBRIDGE;
  const bridgePivot = new THREE.Group();
  bridgePivot.position.set(DB.x, DB.top, DB.hinge);
  {
    const deck = new THREE.Mesh(mergeUV([
      { geo: boxGeo(DB.w, 0.36, DB.len, 1.2), x: 0, y: -0.18, z: DB.len / 2 },
      ...[0.6, DB.len / 2, DB.len - 0.6].map(z => ({ geo: boxGeo(DB.w + 0.2, 0.2, 0.3, 1), x: 0, y: 0.06, z })),
    ]), woodMat);
    deck.castShadow = true; deck.receiveShadow = true;
    bridgePivot.add(deck);
    for (const sx of [-1, 1]) { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), M.mat(0x4a4a52, { metalness: 0.6, roughness: 0.4 })); ring.position.set(sx * (DB.w / 2 - 0.2), 0.12, DB.len - 0.3); bridgePivot.add(ring); }
  }
  sc.add(bridgePivot); moving.push(bridgePivot);
  const chainMat = M.mat(0x4a4a52, { metalness: 0.6, roughness: 0.45 });
  const chains = [-1, 1].map(sx => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1, 6), chainMat); sc.add(m); moving.push(m); return { m, sx }; });

  // --- pattes dorées, bouton des remparts, patte rouge --------------------------------------------
  const pawGold = [pawTexture('#d8ccb8', '#8a7a68'), pawTexture('#ffd23a', '#a86a00')];
  const pawRed = [pawTexture('#f0c8c8', '#c03040'), pawTexture('#ff5a6a', '#ffffff')];
  const makePlate = (x, y, z, tex, ringCol, rad) => {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(rad + 0.25, rad + 0.4, 0.3, 24), M.mat(0x9a8a7a, { roughness: 0.9 }));
    base.position.y = 0.1; g.add(base);
    const topMat = new THREE.MeshStandardMaterial({ map: tex[0], roughness: 0.6, emissive: ringCol, emissiveIntensity: 0 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(rad, rad, 0.18, 24), [M.mat(0x6a5a4a), topMat, M.mat(0x6a5a4a)]);
    top.position.y = 0.32; g.add(top);
    const glowR = new THREE.Mesh(new THREE.RingGeometry(rad + 0.1, rad + 0.8, 32), new THREE.MeshBasicMaterial({ color: ringCol, transparent: true, opacity: 0, depthWrite: false }));
    glowR.rotation.x = -Math.PI / 2; glowR.position.y = 0.06; glowR.userData.noOutline = true; g.add(glowR);
    g.position.set(x, y - 0.05, z);
    sc.add(g);
    return { g, top, topMat, glow: glowR, tex };
  };
  const plates = S.PLATES.map(p => makePlate(p.x, p.y, p.z, pawGold, 0xffd23a, 1.1));
  const wallBtn = makePlate(S.WALL_SWITCH.x, S.WALL_SWITCH.y, S.WALL_SWITCH.z, pawGold, 0xffd23a, 1.05);
  const laserBtn = makePlate(S.LASER_BUTTON.x, S.LASER_BUTTON.y, S.LASER_BUTTON.z, pawRed, 0xff4050, 1.15);

  // --- la porte de la Salle du Point Rouge (deux battants) -----------------------------------------
  const doorLeaves = [-1, 1].map(sx => {
    const piv = new THREE.Group(); piv.position.set(sx * 2.5, FL, -13.4);
    const leaf = new THREE.Mesh(mergeUV([
      { geo: boxGeo(2.45, 4.55, 0.35, 1.2), x: -sx * 1.24, y: 2.28, z: 0 },
      { geo: boxGeo(2.5, 0.2, 0.42, 1), x: -sx * 1.24, y: 1.0, z: 0, color: 0x5a4a40 },
      { geo: boxGeo(2.5, 0.2, 0.42, 1), x: -sx * 1.24, y: 3.6, z: 0, color: 0x5a4a40 },
    ]), woodMat);
    leaf.castShadow = true; piv.add(leaf);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), goldMat); knob.position.set(-sx * 2.2, 2.2, 0.25); piv.add(knob);
    sc.add(piv); moving.push(piv);
    return { piv, sx };
  });
  // un poisson doré sculpté au-dessus de la porte
  { const f = new THREE.Mesh(fishGeometry(), goldMat); f.scale.setScalar(2.2); f.position.set(0, FL + 5.0, -13.05); sc.add(f); }

  // --- les pelotes géantes à pousser ---------------------------------------------------------------
  const R = S.BALL_R;
  const ballCols = [0xff6ab0, 0x5ac8ff];
  const balls = S.BALLS.map((d, i) => {
    const g = new THREE.Group();
    const sphere = new THREE.Mesh(new THREE.SphereGeometry(R, 32, 20), new THREE.MeshStandardMaterial({ map: yarnTex, color: ballCols[i], roughness: 1 }));
    sphere.castShadow = true; g.add(sphere);
    const thread = M.mat(new THREE.Color(ballCols[i]).multiplyScalar(0.8).getHex(), { roughness: 1 });
    for (let k = 0; k < 3; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(R * 0.99, 0.045, 6, 40), thread); t.rotation.set(k * 1.05, k * 0.8, 0); g.add(t); }
    const roll = new THREE.Group(); roll.add(g);
    // le bout de laine qui traîne
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 5), thread); tail.rotation.z = Math.PI / 2;
    const holder = new THREE.Group(); holder.add(roll, tail);
    sc.add(holder); moving.push(holder);
    const col = { type: 'cyl', x: d.x, z: d.z, r: R * 0.92, y0: d.y, y1: d.y + R * 2 - 0.05, kind: 'yarnball', solid: true, moving: true, dx: 0, dz: 0 };
    if (!S.colliders.includes(col)) S.colliders.push(col);
    return { def: d, holder, roll, tail, col, x: d.x, z: d.z, y: d.y, vx: 0, vz: 0, slot: null, snap: 0, blockedT: 0, lx: d.x, lz: d.z, q: new THREE.Quaternion() };
  });
  // (le module des données survit d'une partie à l'autre : on enlève les anciennes pelotes)
  for (let i = S.colliders.length - 1; i >= 0; i--) if (S.colliders[i].kind === 'yarnball' && !balls.some(b => b.col === S.colliders[i])) S.colliders.splice(i, 1);

  // --- le point rouge ----------------------------------------------------------------------------
  const dot = new THREE.Group();
  {
    const d = new THREE.Mesh(new THREE.CircleGeometry(0.32, 20), new THREE.MeshBasicMaterial({ color: 0xff2030 }));
    d.rotation.x = -Math.PI / 2; dot.add(d);
    const h = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshBasicMaterial({ map: M.glowTexture(), color: 0xff3040, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    h.rotation.x = -Math.PI / 2; h.position.y = 0.01; dot.add(h);
  }
  dot.traverse(o => { o.userData.noOutline = true; });
  dot.visible = false; sc.add(dot);
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 6), new THREE.MeshBasicMaterial({ color: 0xff4050, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending }));
  beam.userData.noOutline = true; beam.visible = false; sc.add(beam);

  // --- les personnages ---------------------------------------------------------------------------
  const tint = (o, hex) => o.traverse(k => { if (k.isMesh && k.material && k.material.color && !k.userData.isOutline) { k.material = k.material.clone(); k.material.color.multiply(new THREE.Color(hex)); } });
  // le bandana rouge des chats bandits devient un foulard de couleur (les cousins de Pompon sont gentils)
  const recolor = (o, hex) => {
    const to = new THREE.Color(hex), done = new Set();
    o.traverse(k => {
      const g = k.geometry, a = g && g.attributes.color;
      if (!a || done.has(g)) return;
      done.add(g);
      for (let i = 0; i < a.count; i++) { const r = a.getX(i), gg = a.getY(i), b = a.getZ(i); if (r > 0.45 && gg < 0.2 && b < 0.2) a.setXYZ(i, to.r * r / 0.85, to.g * r / 0.85, to.b * r / 0.85); }
      a.needsUpdate = true;
    });
  };
  // les cousins de Pompon (siesteurs de la Salle du Point Rouge)
  const CAT_TINTS = [0xffd0a0, 0xffffff, 0xd8c8ff, 0xffe8c8, 0xc8d8c0];
  const BANDANAS = [0x5ab0ff, 0xffc83a, 0x8ae05a, 0xc88aff, 0xff9ad8];
  const hallCats = S.NAP.map((n, i) => {
    const m = M.buildCat(); m.scale.setScalar(0.92);
    recolor(m, BANDANAS[i]);
    tint(m, CAT_TINTS[i]);
    sc.add(m); chars.push(m); moving.push(m);
    return { m, x: n.x, z: n.z, y: FL, yaw: Math.PI * (i % 2 ? 0.1 : -0.1), phase: i, hop: 0, home: n, speed: 5.6 + i * 0.35 };
  });
  // Pompon : un petit chaton, béret bleu à pompon et écharpe
  const pompon = M.buildCat();
  pompon.scale.setScalar(0.66);
  recolor(pompon, 0x3a6ad8);
  tint(pompon, 0xfff0e0);
  {
    const u = pompon.userData;
    const beret = new THREE.Mesh(new THREE.SphereGeometry(0.42, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.mat(0x3a6ad8, { roughness: 0.8 }));
    beret.scale.set(1.15, 0.45, 1.15); beret.position.set(0.05, 0.3, -0.02); beret.rotation.z = -0.25; u.head.add(beret);
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), M.mat(0xffffff, { roughness: 1 }));
    pom.position.set(0.1, 0.5, -0.02); u.head.add(pom);
    const scarf = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.08, 8, 20), M.mat(0x3a6ad8, { roughness: 0.9 }));
    scarf.rotation.x = Math.PI / 2 - 0.3; scarf.position.set(0, 0.72, 0.22); pompon.add(scarf);
  }
  sc.add(pompon); chars.push(pompon); moving.push(pompon);
  const pompSt = { x: 0, z: 0, y: 0, stage: -1, yaw: 0, wave: 0 };
  // la Capitaine Moustache, sur son trône
  const cap = buildCaptain();
  sc.add(cap); chars.push(cap); moving.push(cap);
  // les amis de la fête (cachés jusqu'à la fête)
  const guests = [];
  {
    const realNpc = game.realistic;
    const mamie = realNpc && N.hasNpc('mamie2') ? N.buildMamieStanding() : M.buildMamie();
    if (mamie.userData.rig) mamie.scale.multiplyScalar(1.25);
    const bisc = realNpc && N.hasNpc('biscotte') ? N.buildNpc('biscotte', { head: 0.3, tail: 0.12 }) : M.buildPuppy();
    const list = [[mamie, -4.2, -63.2, 'mamie'], [bisc, -2.6, -61.2, 'dog']];
    let k = 0;
    for (const look of ['baker', 'sailor', 'mayor', 'police']) {
      let m = null;
      try { m = buildCitizen(look); } catch (e) { m = null; }
      if (m) { const a = 0.9 + k * 0.75; list.push([m, Math.cos(a) * 6.5, -62 + Math.sin(a) * 3.2 - 0.5, 'dog']); k++; }
    }
    for (const [m, x, z, kind] of list) {
      m.visible = false; sc.add(m); chars.push(m); moving.push(m);
      guests.push({ m, x, z, kind, ph: guests.length * 1.3 });
    }
  }
  const partyLight = new THREE.Group();
  {
    const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.9, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.9, roughness: 0.15, flatShading: true, emissive: 0x6a5a8a, emissiveIntensity: 0.5 }));
    partyLight.add(ball);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2, 4), M.mat(0xdddddd)); string.position.y = 1.4; partyLight.add(string);
    partyLight.position.set(0, TOPY + 5.2, -62); partyLight.visible = false; sc.add(partyLight);
  }
  for (const m of partyDeco) m.visible = false;

  // --- drapeaux (points de passage) ------------------------------------------------------------
  const flagTex = pennantTexture();
  const st = {
    cp: cs().cp, bridgeK: cs().bridge ? 1 : 0, doorK: cs().wall ? 1 : 0,
    plates: S.PLATES.map(() => false), wallOn: false, laserOn: false, laserT0: -99, laserUntil: -99, btn: false,
    cap: { ph: cs().party ? 'party' : 'throne', x: S.CAPTAIN.x, z: S.CAPTAIN.z, y: S.CAPTAIN.y, yaw: 0, inv: 0, boost: 0, away: 0, hop: 0, t: 0 },
    told: {}, barkT: new Map(), partyT: 0, pileOn: true,
  };
  const flags = S.CHECKPOINTS.map((c, i) => {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 3.6, 8), M.mat(0xf0e6d0, { metalness: 0.3, roughness: 0.4 }));
    pole.position.y = 1.8; g.add(pole);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), goldMat); knob.position.y = 3.65; g.add(knob);
    const clothGeo = new THREE.PlaneGeometry(1.4, 0.75, 10, 4); clothGeo.translate(0.72, 0, 0);
    const cloth = new THREE.Mesh(clothGeo, new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide, roughness: 0.8, color: 0x9a9a9a }));
    cloth.position.y = 1.0; g.add(cloth);
    const halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.4, 32), new THREE.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0, depthWrite: false }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.05; halo.userData.noOutline = true; g.add(halo);
    g.position.set(c.x, c.y, c.z);
    sc.add(g);
    return { def: c, g, cloth, halo, base: clothGeo.attributes.position.array.slice(), raise: i <= st.cp ? 1 : 0, raisedAt: -9 };
  });

  // --- état et règles ------------------------------------------------------------------------------
  const P_IN = (P, r) => !P.ko && inRect(r, P.pos.x, P.pos.z);
  const onPad = (P, x, z, y, rad) => !P.ko && Math.hypot(P.pos.x - x, P.pos.z - z) < (rad || 1.25) && Math.abs(P.pos.y - y) < 0.9;
  const inThrone = (P) => P_IN(P, S.THRONE) && P.pos.y > TOPY - 1;
  const tell = (k, a, b, ms) => { if (st.told[k]) return; st.told[k] = true; game.banner(a, b, ms || 2600); };
  const stage = () => { const k = cs(); return k.party ? 5 : !k.bridge ? 0 : !k.wall ? 1 : !k.laser ? 2 : st.cp < 4 ? 3 : 4; };

  function applyColliders() {
    const k = cs();
    S.bridgeCol.off = !k.bridge; S.gateCol.off = !!k.bridge;
    S.DOOR1.off = !!k.wall;
    S.CAT_PILE.off = !!k.laser || !st.pileOn;
  }
  applyColliders();

  function reachCheckpoint(id) {
    if (id <= st.cp) return;
    st.cp = id; cs().cp = id; game.persist();
    const f = flags[id]; f.raisedAt = game.t;
    game.sound('reveal');
    game.burst(f.g.position.x, f.g.position.y + 3.6, f.g.position.z, 24, 0xffe070, 4, 0.8);
    game.banner('Drapeau !', `${S.CHECKPOINTS[id].name} : en cas de pépin, on repart d'ici.`, 2000);
  }
  function lowerBridge() {
    const k = cs(); if (k.bridge) return;
    k.bridge = true; game.persist(); applyColliders();
    game.sound('reveal'); game.sound('chain');
    for (const P of game.players) P.cheerT = 1.2;
    game.banner('Le pont-levis descend !', 'Bravo ! Le château est ouvert.', 2800);
    game.updateMedalVisibility(); game.updateHud();
  }
  function openDoor1() {
    const k = cs(); if (k.wall) return;
    k.wall = true; game.persist(); applyColliders();
    game.sound('reveal');
    for (const P of game.players) P.cheerT = 1.0;
    game.banner('Clac ! Une porte s\'ouvre…', 'La Salle du Point Rouge est ouverte, au fond de la cour.', 2800);
    game.updateHud();
  }
  function laserDone() {
    const k = cs(); if (k.laser) return;
    k.laser = true; game.persist(); applyColliders();
    game.sound('reveal');
    game.banner('Les chats jouent au point rouge !', 'Ils ne s\'arrêteront plus : le passage est libre.', 2800);
    game.updateHud();
  }

  // pelotes : poussées par les chiens, arrêtées par les murs, calées dans leur empreinte
  const ballBlocked = (b, x, z) => {
    if (b.def.zone === 'court' && !inRect(S.COURT, x, z, -R * 0.9)) return true;
    const h = S.heightAt(x, z);
    if (Math.abs(h - b.y) > 0.32 || h < 1) return true;
    for (const c of S.colliders) {
      if (c.off || c === b.col || c.y1 <= b.y + 0.4 || c.y0 >= b.y + R * 2) continue;
      if (c.kind === 'pad' || c.kind === 'plank' || c.kind === 'bridge') continue;
      if (S.inside(c, x, z, R * 0.92)) return true;
    }
    return false;
  };
  function stepBalls(dt) {
    const k0 = cs();
    for (const b of balls) {
      const x0 = b.x, z0 = b.z;
      if (b.slot) {
        // elle glisse jusqu'au centre de son empreinte, puis ne bouge plus
        const T = b.slot === 'wall' ? S.SLOT : S.PLATES.find(p => p.id === b.slot);
        b.x += (T.x - b.x) * Math.min(1, dt * 6); b.z += (T.z - b.z) * Math.min(1, dt * 6);
        b.vx = b.vz = 0;
      } else {
        let pushed = false;
        for (const P of game.players) {
          if (P.ko) continue;
          const dx = b.x - P.pos.x, dz = b.z - P.pos.z, d = Math.hypot(dx, dz);
          if (d > R + 0.85 || d < 0.01 || P.pos.y > b.y + R * 1.3) continue;
          const v = (P.vel.x * dx + P.vel.z * dz) / d;
          if (v < 0.8) continue;
          const sp = Math.min(9, v * (P.dashT > 0 ? 1.5 : 0.95));
          b.vx = lerp(b.vx, dx / d * sp, 0.5); b.vz = lerp(b.vz, dz / d * sp, 0.5);
          pushed = true;
          if (!st.told['push' + b.def.id] && P === game.me) { st.told['push' + b.def.id] = true; game.banner('Ça roule !', 'Marchez dans la pelote pour la pousser', 1800); }
        }
        // un petit aimant : une pelote qui roule près de son empreinte s'y dirige toute seule
        const goal = b.def.zone === 'out' ? (k0.bridge ? null : S.PLATES.reduce((a2, p) => (Math.hypot(b.x - p.x, b.z - p.z) < Math.hypot(b.x - a2.x, b.z - a2.z) ? p : a2))) : S.SLOT;
        if (goal && Math.hypot(b.vx, b.vz) > 0.5) {
          const gx = goal.x - b.x, gz = goal.z - b.z, gd = Math.hypot(gx, gz);
          if (gd < 4 && gd > 0.01) { b.vx += gx / gd * 9 * dt; b.vz += gz / gd * 9 * dt; }
        }
        const sp = Math.hypot(b.vx, b.vz);
        if (sp > 0.02) {
          const nx = b.x + b.vx * dt, nz = b.z + b.vz * dt;
          let hit = false;
          if (!ballBlocked(b, nx, nz)) { b.x = nx; b.z = nz; } else if (!ballBlocked(b, nx, b.z)) { b.x = nx; b.vz = 0; hit = true; } else if (!ballBlocked(b, b.x, nz)) { b.z = nz; b.vx = 0; hit = true; } else { b.vx = b.vz = 0; hit = true; }
          b.blockedT = hit && pushed ? b.blockedT + dt : Math.max(0, b.blockedT - dt);
          if (b.def.zone === 'out') b.y = S.heightAt(b.x, b.z);
        } else b.blockedT = Math.max(0, b.blockedT - dt * 0.5);
        if (!pushed) { const k = Math.exp(-dt * 3.2); b.vx *= k; b.vz *= k; }
        // empreintes : une patte dorée (dehors), le pied du rempart (dans la cour)
        if (b.def.zone === 'out') {
          for (const p of S.PLATES) if (!k0.bridge && Math.hypot(b.x - p.x, b.z - p.z) < 2.0) { b.slot = p.id; game.sound('switch'); game.burst(p.x, p.y + 0.5, p.z, 16, 0xffd23a, 3, 0.6); }
        } else if (Math.hypot(b.x - S.SLOT.x, b.z - S.SLOT.z) < 2.2) {
          b.slot = 'wall'; game.sound('switch'); game.burst(S.SLOT.x, S.SLOT.y + 0.3, S.SLOT.z, 18, 0xffd23a, 3, 0.6);
          game.banner('La pelote est calée !', 'Grimpez dessus, puis sautez deux fois jusqu\'au rempart', 2600);
        }
        // coincée contre un mur depuis un moment : elle revient à sa place
        if (b.blockedT > 3.5 && !b.slot) {
          b.blockedT = 0; b.vx = b.vz = 0;
          game.burst(b.x, b.y + R, b.z, 20, 0xffffff, 4, 0.6); game.sound('poof');
          b.x = b.def.x; b.z = b.def.z; b.y = b.def.y;
          game.burst(b.x, b.y + R, b.z, 20, 0xffffff, 4, 0.6);
          game.banner('Hop !', 'La pelote était coincée : elle revient à sa place', 1800);
        }
      }
      b.col.dx = b.x - x0; b.col.dz = b.z - z0;
      b.col.x = b.x; b.col.z = b.z; b.col.y0 = b.y; b.col.y1 = b.y + R * 2 - 0.05;
    }
  }
  // le « Ouaf ! » fait rouler les pelotes et sursauter les chats qui dorment
  function onBark(P) {
    for (const b of balls) {
      if (b.slot) continue;
      const dx = b.x - P.pos.x, dz = b.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d < 4 && d > 0.1 && Math.abs(P.pos.y - b.y) < 2) { b.vx += dx / d * 5; b.vz += dz / d * 5; }
    }
    if (!cs().laser && !st.laserOn && Math.hypot(P.pos.x, P.pos.z + 31.6) < 9) {
      for (const c of hallCats) c.hop = 0.5;
      game.bubble({ pos: new THREE.Vector3(0, FL + 0.6, -31.4), small: true }, 'Zzz…');
      tell('nap', 'Les chats font la sieste…', 'Même un « Ouaf ! » ne les fait pas bouger. Essayez la patte rouge !', 3000);
    }
  }

  // la Capitaine : sur son trône, puis on joue à chat, puis la fête
  const C = st.cap;
  function capSit() { C.ph = 'throne'; C.x = S.CAPTAIN.x; C.z = S.CAPTAIN.z; C.y = S.CAPTAIN.y; C.yaw = 0; }
  function startTag() {
    C.ph = 'tag'; C.t = 0; C.hop = 0.7; C.inv = 1; C.away = 0;
    if (game.sfx) game.sfx.music('adv3');
    game.banner('On joue à chat !', `Touchez la Capitaine ${S.TAGS} fois !`, 2600);
    game.updateHud();
  }
  function meetCaptain() {
    C.ph = 'talk';
    const k = cs();
    const lines = [
      { who: 'Capitaine Moustache', text: 'Qui ose entrer dans MA salle du trône ? Ah… c\'est vous, les cabots.' },
      { who: 'Pompon', text: 'C\'est moi qui les ai invités, Tata ! Ils sont venus pour jouer avec toi !' },
      { who: 'Capitaine Moustache', text: 'Jouer ? Moi ? Je suis une capitaine, pas un chaton !' },
      { who: 'Matcha', text: 'Alors on fait un jeu de capitaine : on joue à chat ! C\'est toi le chat… si on t\'attrape trois fois, tu as perdu !' },
      { who: 'Capitaine Moustache', text: 'Miaou-ha-ha ! Personne n\'attrape la Capitaine Moustache ! Essayez donc !' },
    ];
    game.say(lines, () => { k.met = true; game.persist(); startTag(); });
  }
  function tagged(P) {
    const k = cs();
    k.tags = (k.tags || 0) + 1; game.persist();
    C.inv = 1.3; C.boost = 0.9; C.hop = 0.5;
    game.sound('boing'); game.sound('meowHi');
    game.burst(C.x, C.y + 1.4, C.z, 22, 0xffe070, 4.5, 0.7);
    game.bubble({ pos: new THREE.Vector3(C.x, C.y + 1.2, C.z), small: false }, k.tags >= S.TAGS ? 'Hi hi hi !' : 'Touchée !');
    if (P) P.cheerT = 0.8;
    game.updateHud();
    if (k.tags >= S.TAGS) { C.ph = 'talk'; setTimeout(() => { if (!game.disposed) endTag(); }, 700); return; }
    game.banner(k.tags === 1 ? 'Touchée ! 1/3' : `Encore ! ${k.tags}/${S.TAGS}`, k.tags === 1 ? 'Elle court plus vite… rattrapez-la !' : 'Plus qu\'une fois !', 1800);
  }
  function endTag() {
    game.say([
      { who: 'Capitaine Moustache', text: 'Hi hi hi… Ha ha ha ! Arrêtez, ça chatouille ! D\'accord, d\'accord : vous m\'avez eue !' },
      { who: 'Capitaine Moustache', text: 'Ça fait si longtemps que je n\'avais pas ri comme ça…' },
      { who: 'Pompon', text: 'Tu vois, Tata ? C\'est mieux, à plusieurs !' },
      { who: 'Capitaine Moustache', text: 'Pompon… tu as raison. Qu\'on prépare la fête ! Musique ! Confettis ! Et faites entrer tous nos amis !' },
    ], () => startParty(true));
  }
  function startParty(fresh) {
    const k = cs();
    k.party = true; game.persist();
    C.ph = 'party'; st.partyT = 0;
    if (game.sfx) game.sfx.music('adv3');
    game.updateMedalVisibility(); game.updateHud();
    if (!fresh) return;
    game.sound('win');
    for (let i = 0; i < 6; i++) game.burst(S.PARTY.x + (i - 2.5) * 2.2, TOPY + 4, S.PARTY.z, 20, [0xff5a6a, 0xffd23a, 0x5ac8ff, 0x8ae05a, 0xc88aff, 0xffffff][i], 5, 1.0);
    for (const P of game.players) P.cheerT = 2;
    game.banner('C\'est la fête au château !', 'Tous les amis sont là !', 3000);
    setTimeout(() => {
      if (game.disposed || game.dialog) return;
      game.say([
        { who: 'Mamie Labrador', text: 'Nous voilà ! Personne ne voulait rater ça. Biscotte a couru tout le long du chemin !' },
        { who: 'Biscotte', text: 'Des chats et des chiens qui dansent ensemble ! Trop bien !' },
        { who: 'Capitaine Moustache', text: 'Et voici mon plus beau trésor : la Couronne de l\'Amitié. Elle est sur mon trône… elle est pour vous !' },
      ]);
    }, 2200);
  }
  function stepCaptain(dt) {
    const k = cs(), players = game.players;
    const inside = players.filter(inThrone);
    C.inv = Math.max(0, C.inv - dt); C.boost = Math.max(0, C.boost - dt); C.hop = Math.max(0, C.hop - dt);
    if (C.ph === 'throne') {
      if (inside.length && !game.dialog && !game.cine) {
        if (!k.met) meetCaptain();
        else startTag();
      }
      return;
    }
    if (C.ph !== 'tag') return;
    C.t += dt;
    // tout le monde est sorti : elle retourne s'asseoir (les touches restent comptées)
    if (!inside.length) { C.away += dt; if (C.away > 5) { capSit(); if (game.sfx) game.sfx.music(S.MUSIC); } return; }
    C.away = 0;
    // elle file loin du chien le plus proche, en restant dans la salle
    let best = null, bd = 1e9;
    for (const P of inside) { const d = Math.hypot(P.pos.x - C.x, P.pos.z - C.z); if (d < bd) { bd = d; best = P; } }
    const Z = S.TAG_ZONE, cx = (Z.x0 + Z.x1) / 2, cz = (Z.z0 + Z.z1) / 2;
    let dx = C.x - best.pos.x, dz = C.z - best.pos.z;
    const dl = Math.hypot(dx, dz) || 1; dx /= dl; dz /= dl;
    // les murs la repoussent vers le milieu (et elle tourne autour, comme au jeu de chat)
    const wx = (C.x - cx) / ((Z.x1 - Z.x0) / 2), wz = (C.z - cz) / ((Z.z1 - Z.z0) / 2);
    const edge = Math.max(Math.abs(wx), Math.abs(wz));
    if (edge > 0.6) { const k2 = (edge - 0.6) * 2.5; dx -= wx * k2; dz -= wz * k2; dx += -dz * 0.8 * Math.sign(Math.sin(C.t * 0.4) + 0.2); dz += dx * 0.3; }
    dx += Math.sin(C.t * 1.7) * 0.35; dz += Math.cos(C.t * 1.3) * 0.35;
    const l2 = Math.hypot(dx, dz) || 1; dx /= l2; dz /= l2;
    const base = (game.easy ? 3.9 : game.mode === 'defi' ? 5.6 : 4.8) + (k.tags || 0) * 0.5;
    const sp = (bd > 7 ? base * 0.55 : base) * (C.boost > 0 ? 1.7 : 1) * (C.hop > 0.2 && C.t < 1 ? 0.3 : 1);
    C.x = clamp(C.x + dx * sp * dt, Z.x0, Z.x1); C.z = clamp(C.z + dz * sp * dt, Z.z0, Z.z1);
    C.y += (TOPY - C.y) * Math.min(1, dt * 6);
    C.yaw = lerpAngle(C.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10));
    if (C.inv <= 0 && C.t > 0.8) for (const P of inside) {
      if (Math.hypot(P.pos.x - C.x, P.pos.z - C.z) < 1.6 && Math.abs(P.pos.y - C.y) < 1.8) { tagged(P); break; }
    }
    tell('tagHint', 'Elle est rapide !', `Coupez-lui la route… ou faites une charge (${game.controlsHelp().dash}) !`, 2600);
  }

  // les chats de la Salle du Point Rouge
  function stepHallCats(dt) {
    const t = game.t, k = cs();
    st.laserOn = !!k.laser || t < st.laserUntil;
    const dp = S.dotAt(t - st.laserT0);
    let home = 0;
    hallCats.forEach((c, i) => {
      let tx, tz, sp;
      if (st.laserOn) {
        const a = i * 1.2566 + t * 0.9, rr = 0.9 + (i % 3) * 0.35;
        tx = dp.x + Math.cos(a) * rr; tz = dp.z + Math.sin(a) * rr; sp = c.speed;
      } else { tx = c.home.x; tz = c.home.z; sp = 2.6; }
      const dx = tx - c.x, dz = tz - c.z, d = Math.hypot(dx, dz);
      if (d > 0.08) {
        const s = Math.min(d, sp * dt);
        c.x += dx / d * s; c.z += dz / d * s;
        c.yaw = lerpAngle(c.yaw, Math.atan2(dx, dz), Math.min(1, dt * 9));
        c.phase += s * 3.2;
        c.moving = s > 0.01;
      } else c.moving = false;
      c.x = clamp(c.x, S.HALL.x0 + 0.6, S.HALL.x1 - 0.6); c.z = clamp(c.z, S.HALL.z0 + 0.4, S.HALL.z1 - 0.6);
      if (st.laserOn && d < 1.4 && Math.random() < dt * 1.5) c.hop = 0.45;      // ils bondissent sur le point
      if (!st.laserOn && d < 0.4) home++;
    });
    st.pileOn = !k.laser && home >= 3;
    applyColliders();
  }

  function stepPompon() {
    const sg = stage();
    if (sg !== pompSt.stage) {
      const p = S.POMPON[sg];
      if (pompSt.stage >= 0) { game.burst(pompSt.x, pompSt.y + 0.5, pompSt.z, 14, 0xffffff, 3, 0.5); game.burst(p.x, p.y + 0.5, p.z, 14, 0xffffff, 3, 0.5); }
      pompSt.stage = sg; pompSt.x = p.x; pompSt.z = p.z; pompSt.y = p.y;
    }
  }

  const solo = () => game.players.length === 1;
  const logic = {
    moving, chars,
    _debug: { st, balls, hallCats, cap: C, pompon: pompSt },      // (pour les tests)
    step(dt) {
      const t = game.t, players = game.players, k = cs();
      for (const P of players) {
        // drapeaux
        for (const c of S.CHECKPOINTS) if (c.id > st.cp && Math.hypot(P.pos.x - c.x, P.pos.z - c.z) < 4.5 && Math.abs(P.pos.y - c.y) < 3) reachCheckpoint(c.id);
        // aboiement
        const prev = st.barkT.get(P) || 0, now = P.barkT || 0;
        if (now > prev + 0.3) onBark(P);
        st.barkT.set(P, now);
      }
      stepBalls(dt);
      // 1. les pattes dorées du pont-levis
      const pressed = S.PLATES.map(p => players.some(q => onPad(q, p.x, p.z, p.y)) || balls.some(b => b.slot === p.id));
      pressed.forEach((on, i) => { if (on && !st.plates[i]) game.sound('switch'); });
      st.plates = pressed;
      if (!k.bridge) {
        if (pressed.every(Boolean)) lowerBridge();
        else if (pressed.some(Boolean) && t - (st.plateHintT || -9) > 7) {
          st.plateHintT = t;
          game.banner('Une patte de plus !', solo() ? 'Poussez la pelote géante sur l\'autre patte dorée' : 'Un ami sur l\'autre patte… ou la pelote géante !', 2400);
        }
      }
      // 2. le bouton des remparts
      const wsOn = players.some(q => onPad(q, S.WALL_SWITCH.x, S.WALL_SWITCH.z, S.WALL_SWITCH.y, 1.2));
      if (wsOn && !st.wallOn) game.sound('switch');
      st.wallOn = wsOn;
      if (wsOn && !k.wall) openDoor1();
      if (!k.wall && players.some(q => Math.hypot(q.pos.x - (S.LEDGE.x0 - 1), q.pos.z - S.SLOT.z) < 4 && q.pos.y < FL + 0.5)) tell('ledge', 'Trop haut !', 'Poussez la pelote bleue contre le rempart, sur l\'empreinte dorée', 2600);
      // 3. la patte rouge : le point rouge s'allume
      const btn = players.some(q => onPad(q, S.LASER_BUTTON.x, S.LASER_BUTTON.z, S.LASER_BUTTON.y, 1.3));
      if (btn) {
        const keep = (solo() ? S.LASER_TIME : 5) + (game.easy ? 6 : 0);
        if (t >= st.laserUntil && !k.laser) { st.laserT0 = t; game.sound('switch'); game.banner('Le point rouge !', 'Les chats se réveillent… et le poursuivent !', 2400); }
        st.laserUntil = Math.max(st.laserUntil, t + keep);
      }
      st.btn = btn;
      stepHallCats(dt);
      if (!k.laser && players.some(q => q.pos.z < -34.6 && q.pos.z > -41 && q.pos.y < FL + 3)) laserDone();
      stepPompon();
      stepCaptain(dt);
      // la fête : des confettis qui tombent du plafond
      if (k.party) {
        st.partyT += dt;
        const near = players.some(q => q.pos.z < -50);
        if (near) for (let i = 0; i < (lite ? 1 : 2); i++) if (Math.random() < dt * 22) {
          game.spawnParticle(S.PARTY.x + (Math.random() - 0.5) * 22, TOPY + 6 + Math.random(), S.PARTY.z + (Math.random() - 0.5) * 12, (Math.random() - 0.5) * 1.5, -0.5, (Math.random() - 0.5) * 1.5,
            [0xff5a6a, 0xffd23a, 0x5ac8ff, 0x8ae05a, 0xc88aff, 0xff9ad8][Math.floor(Math.random() * 6)], 0.2, 3.2, 1.2);
        }
      }
    },
    /** Mode Promenade : où mènent les étincelles. */
    guideTarget(me) {
      const k = cs();
      if (!k.bridge) {
        const b = balls[0];
        if (game.players.length === 1 && !b.slot) return Math.hypot(me.pos.x - b.x, me.pos.z - b.z) > 3 ? { x: b.x, y: b.y + 1, z: b.z } : { x: S.PLATES[0].x, y: S.PLATES[0].y, z: S.PLATES[0].z };
        const free = S.PLATES.find((p, i) => !st.plates[i]) || S.PLATES[1];
        return { x: free.x, y: free.y, z: free.z };
      }
      if (!k.wall) {
        const b = balls[1];
        if (!b.slot) return Math.hypot(me.pos.x - b.x, me.pos.z - b.z) > 3 ? { x: b.x, y: b.y + 1, z: b.z } : { x: S.SLOT.x, y: S.SLOT.y, z: S.SLOT.z };
        return { x: S.WALL_SWITCH.x, y: S.WALL_SWITCH.y, z: S.WALL_SWITCH.z };
      }
      if (!k.laser) return st.laserOn ? { x: 0, y: FL, z: -36 } : { x: S.LASER_BUTTON.x, y: S.LASER_BUTTON.y, z: S.LASER_BUTTON.z };
      if (st.cp < 4) {
        if (me.pos.y < FL + 1) return { x: S.catTree[0].x, y: S.catTree[0].top, z: S.catTree[0].z };
        return { x: 0, y: TOPY, z: -53.4 };
      }
      if (!k.party) return C.ph === 'tag' ? { x: C.x, y: C.y, z: C.z } : { x: 0, y: TOPY, z: -60 };
      const g = S.medals.find(m => m.id === S.FINAL_MEDAL);
      return save().medals.includes(g.id) ? null : g;
    },
    camFocus() { return C.ph === 'tag' ? { x: C.x, y: C.y + 1, z: C.z } : null; },
    reveal() {
      const o = {}; const k = cs();
      for (const m of S.medals) o[m.id] = true;
      o.m_gate = !!k.bridge;
      o.m_goal = !!k.party;
      return o;
    },
    applySave() {
      st.cp = cs().cp;
      flags.forEach((f, i) => { f.raise = i <= st.cp ? 1 : 0; });
      if (cs().party) { C.ph = 'party'; } else if (C.ph === 'party') capSit();
      applyColliders();
    },
    respawn() { const c = S.CHECKPOINTS[st.cp] || S.CHECKPOINTS[0]; return { x: c.x, y: c.y + 0.3, z: c.z, yaw: Math.PI }; },
    questText() {
      const s = save(), k = cs();
      const n = s.medals.length;
      if (!s.intro) return 'Parle à Mamie Labrador';
      if (!k.bridge) return 'Fais descendre le pont-levis : deux pattes dorées !';
      if (!k.wall) return 'Grimpe sur le rempart avec la pelote bleue';
      if (!k.laser) return 'Réveille les chats avec le point rouge';
      if (st.cp < 4) return 'Grimpe en haut de l\'Arbre à Chats';
      if (C.ph === 'tag') return `On joue à chat ! Touche la Capitaine (${k.tags || 0}/${S.TAGS})`;
      if (!k.party) return 'Va voir la Capitaine dans la salle du trône';
      if (!s.medals.includes(S.FINAL_MEDAL)) return 'Prends la Couronne de l\'Amitié sur le trône !';
      return `Le château est en fête ! Trésors ${n}/${S.medals.length}`;
    },
    minimapMarks() {
      const out = [], k = cs();
      S.CHECKPOINTS.forEach((c, i) => out.push([c.x, c.z, i <= st.cp ? '#ffd23a' : '#ffffff', 2.4, false]));
      if (!k.bridge) for (const p of S.PLATES) out.push([p.x, p.z, '#ffb020', 2.2, true]);
      else if (!k.wall) out.push([S.WALL_SWITCH.x, S.WALL_SWITCH.z, '#ffb020', 2.4, true]);
      else if (!k.laser) out.push([S.LASER_BUTTON.x, S.LASER_BUTTON.z, '#ff3a4a', 2.4, true]);
      if (C.ph === 'tag') out.push([C.x, C.z, '#ff5a8a', 2.8, true]);
      return out;
    },
    extraCandidates() {
      const out = [{ kind: 'lv', act: 'pompon', label: 'PARLER', x: pompSt.x, z: pompSt.z, y: pompSt.y }];
      if (C.ph === 'party' || (C.ph === 'throne' && cs().met)) out.push({ kind: 'lv', act: 'cap', label: 'PARLER', x: C.x, z: C.z, y: C.y - (C.ph === 'throne' ? 1.5 : 0) });
      return out;
    },
    interact(n) {
      const k = cs();
      if (n.act === 'cap') {
        if (C.ph === 'throne') { startTag(); return; }
        game.say([{ who: 'Capitaine Moustache', text: 'Merci d\'être venus, les toutous. Revenez jouer à chat quand vous voulez !' }]);
        return;
      }
      if (n.act !== 'pompon') return;
      const sg = stage();
      if (sg === 0) { game.say([{ who: 'Pompon', text: 'Coucou, là-haut ! Les deux pattes dorées font descendre le pont !' }]); return; }
      if (sg === 1 && !k.pompon) {
        game.say([
          { who: 'Pompon', text: 'B-bonjour… Je m\'appelle Pompon. C\'est moi qui vous ai écrit la lettre.' },
          { who: 'Pompon', text: 'Tata Moustache dit qu\'elle n\'a besoin de personne… mais elle joue toute seule depuis des jours.' },
          { who: 'Matcha', text: 'Alors on va lui rendre visite ! Tu viens avec nous, Pompon ?' },
          { who: 'Pompon', text: 'Je passe par les petits passages des chats. On se retrouve plus loin !' },
          { who: 'Pompon', text: 'Le bouton des remparts ouvre la porte. Il est trop haut… mais la grosse pelote bleue, on peut la pousser contre le mur !' },
        ], () => { k.pompon = true; game.persist(); });
        return;
      }
      const hints = {
        1: 'Le bouton des remparts est tout là-haut. Poussez la grosse pelote bleue contre le mur, sur l\'empreinte dorée, et grimpez !',
        2: 'Mes cousins font la sieste devant la porte. Rien ne les réveille… sauf le point rouge ! Montez sur la patte rouge.',
        3: 'L\'Arbre à Chats monte jusqu\'à la terrasse du donjon. C\'est mon coin préféré ! Sautez de plateau en plateau.',
        4: 'Tata est dans la salle du trône. Elle a l\'air fâchée… mais je crois qu\'elle a surtout envie de jouer.',
        5: 'Merci, les toutous ! C\'est la plus belle fête du monde !',
      };
      game.say([{ who: 'Pompon', text: hints[sg] }]);
    },
    snapshot() {
      const r = (v) => Math.round(v * 100) / 100, k = cs();
      return {
        cp: st.cp, k: [k.bridge ? 1 : 0, k.wall ? 1 : 0, k.laser ? 1 : 0, k.met ? 1 : 0, k.party ? 1 : 0, k.tags || 0],
        b: balls.map(b => [r(b.x), r(b.z), r(b.y), b.slot || 0]),
        l: [st.laserOn ? 1 : 0, r(game.t - st.laserT0), r(Math.max(0, st.laserUntil - game.t))],
        c: hallCats.map(c => [r(c.x), r(c.z), r(c.yaw), c.hop > 0 ? 1 : 0]),
        cap: [['throne', 'talk', 'tag', 'party'].indexOf(C.ph), r(C.x), r(C.z), r(C.y), r(C.yaw), C.hop > 0 ? 1 : 0],
        p: st.plates.map(Number), w: st.wallOn ? 1 : 0, bt: st.btn ? 1 : 0, pile: st.pileOn ? 1 : 0,
      };
    },
    apply(x) {
      if (!x) return;
      const k = cs();
      if (x.cp > st.cp) flags[x.cp].raisedAt = game.t;
      st.cp = x.cp; k.cp = x.cp;
      const was = [k.bridge, k.party];
      [k.bridge, k.wall, k.laser, k.met, k.party] = x.k.slice(0, 5).map(Boolean); k.tags = x.k[5];
      if (!was[0] && k.bridge) game.updateMedalVisibility();
      if (!was[1] && k.party) { game.updateMedalVisibility(); if (game.sfx) game.sfx.music('adv3'); }
      x.b.forEach((v, i) => { const b = balls[i]; b.x = v[0]; b.z = v[1]; b.y = v[2]; b.slot = v[3] || null; b.col.x = b.x; b.col.z = b.z; b.col.y0 = b.y; b.col.y1 = b.y + R * 2 - 0.05; });
      st.laserT0 = game.t - x.l[1]; st.laserUntil = game.t + x.l[2]; st.laserOn = !!x.l[0];
      x.c.forEach((v, i) => { const c = hallCats[i]; c.moving = Math.hypot(v[0] - c.x, v[1] - c.z) > 0.01; if (c.moving) c.phase += 0.25; c.x = v[0]; c.z = v[1]; c.yaw = v[2]; if (v[3]) c.hop = Math.max(c.hop, 0.2); });
      const ph = ['throne', 'talk', 'tag', 'party'][x.cap[0]] || 'throne';
      if (ph === 'tag' && C.ph !== 'tag' && game.sfx) game.sfx.music('adv3');
      C.ph = ph; [, C.x, C.z, C.y, C.yaw] = x.cap; if (x.cap[5]) C.hop = Math.max(C.hop, 0.2);
      st.plates = x.p.map(Boolean); st.wallOn = !!x.w; st.btn = !!x.bt; st.pileOn = !!x.pile;
      applyColliders();
      stepPompon();
    },
    talkMamie(first) {
      const s = save();
      const k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Bienvenue au Château des Chats ! C\'est ici qu\'habite la Capitaine Moustache.' },
          { who: 'Biscotte', text: 'Il a des oreilles de chat, le château ! Trop mignon !' },
          { who: 'Mamie Labrador', text: 'Le petit Pompon, son neveu, nous a écrit : sa tata boude toute seule dans sa salle du trône.' },
          { who: 'Mamie Labrador', text: 'Mais le château est plein de jeux de chats : des pattes à presser, des pelotes à pousser, un point rouge…' },
          { who: 'Matcha', text: 'Des énigmes ? J\'adore ça !' },
          { who: 'Mamie Labrador', text: `Pour pousser une pelote géante, marchez dedans. Pour grimper, sautez deux fois (${k.jump}).` },
          { who: 'Mamie Labrador', text: 'Et si un chat farceur vous taquine, un grand « Ouaf ! » le fait filer.' },
          { who: 'Ainu', text: 'Allons rendre le sourire à la Capitaine. Ouaf !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Le pont-levis est levé : cherchez les pattes dorées !', 2800); game.updateHud(); });
        return;
      }
      const n = s.medals.length;
      if (s.medals.includes(S.FINAL_MEDAL)) { game.say([{ who: 'Mamie Labrador', text: `Quelle fête ! Vous avez ${n} trésor${n > 1 ? 's' : ''} sur 5. Les chats et les chiens sont amis, maintenant.` }]); return; }
      game.say([
        { who: 'Mamie Labrador', text: `Vous avez ${n} trésor${n > 1 ? 's' : ''} sur 5. La Capitaine vous attend tout en haut du donjon.` },
        { who: 'Mamie Labrador', text: 'Astuce : quand on est coincé, Pompon a toujours une idée. Allez lui parler !' },
      ]);
    },
    endLines() {
      const kid = window.kidName ? window.kidName() : '';
      return [
        { who: 'Mamie Labrador', text: 'La Couronne de l\'Amitié ! Regardez-moi cette fête : des chats et des chiens qui dansent ensemble !' },
        { who: 'Capitaine Moustache', text: 'Du Parc des Toutous jusqu\'aux Îles du Ciel, et partout ailleurs… vous m\'avez suivie sans jamais abandonner.' },
        { who: 'Capitaine Moustache', text: 'Mon château avait des tours, des pelotes, des coussins… mais il lui manquait des amis.' },
        { who: 'Pompon', text: 'Tata Moustache rit ! Ça faisait si longtemps !' },
        { who: 'Biscotte', text: 'On pourra revenir jouer à chat ? Dis oui, dis oui !' },
        { who: 'Capitaine Moustache', text: 'Les portes du Château des Chats seront toujours ouvertes. Pour les chats… et pour les chiens !' },
        { who: 'Matcha', text: 'Tu vois, Ainu ? Toute cette aventure… et à la fin, on a gagné une amie.' },
        { who: 'Ainu', text: 'La plus belle des chasses au trésor. Merci à tous. Ouaf !' },
        ...(kid ? [{ who: '', text: `Et tout ça, grâce à ${kid}.` }] : []),
        { who: '', text: 'Et depuis ce jour, au Château des Chats, on joue tous ensemble. Fin !' },
      ];
    },
    render(dt, t) {
      const k = cs();
      // pont-levis
      st.bridgeK += ((k.bridge ? 1 : 0) - st.bridgeK) * Math.min(1, dt * 1.6);
      bridgePivot.rotation.x = -Math.PI / 2 * (1 - st.bridgeK);
      const tip = new THREE.Vector3(0, 0.05, DB.len - 0.3).applyEuler(bridgePivot.rotation).add(bridgePivot.position);
      for (const ch of chains) {
        const a = new THREE.Vector3(ch.sx * 2.6, FL + 5.6, 13.25), b = tip.clone(); b.x = ch.sx * (DB.w / 2 - 0.2);
        const mid = a.clone().add(b).multiplyScalar(0.5), len = a.distanceTo(b);
        ch.m.position.copy(mid); ch.m.scale.set(1, len, 1);
        ch.m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
      }
      // porte de la Salle du Point Rouge
      st.doorK += ((k.wall ? 1 : 0) - st.doorK) * Math.min(1, dt * 2);
      for (const d of doorLeaves) d.piv.rotation.y = d.sx * st.doorK * 1.7;
      // pattes et boutons
      const padFx = (p, on, done) => {
        p.top.position.y += ((on ? 0.2 : 0.32) - p.top.position.y) * Math.min(1, dt * 12);
        p.topMat.map = p.tex[on || done ? 1 : 0];
        p.topMat.emissiveIntensity = on ? 0.55 : done ? 0.2 : 0.06 + Math.sin(t * 3) * 0.05;
        p.glow.material.opacity = on ? 0.55 + Math.sin(t * 8) * 0.1 : done ? 0 : 0.18 + Math.sin(t * 3) * 0.1;
      };
      plates.forEach((p, i) => padFx(p, st.plates[i], k.bridge));
      padFx(wallBtn, st.wallOn, k.wall);
      padFx(laserBtn, st.btn || (st.laserOn && !k.laser), k.laser);
      slotMark.visible = !balls[1].slot;
      slotMark.material.opacity = 0.35 + Math.sin(t * 3) * 0.2;
      // pelotes : elles roulent dans le sens où elles avancent
      const ax = new THREE.Vector3(), qq = new THREE.Quaternion();
      for (const b of balls) {
        const dx = b.x - b.lx, dz = b.z - b.lz, d = Math.hypot(dx, dz);
        if (d > 1e-4 && d < 3) { ax.set(dz, 0, -dx).normalize(); qq.setFromAxisAngle(ax, d / R); b.q.premultiply(qq); }
        b.lx = b.x; b.lz = b.z;
        b.roll.quaternion.copy(b.q);
        b.holder.position.set(b.x, b.y + R, b.z);
        b.tail.position.set(d > 1e-4 ? -dx / d * (R + 0.6) : b.tail.position.x, -R + 0.05, d > 1e-4 ? -dz / d * (R + 0.6) : b.tail.position.z);
        if (d > 1e-4) b.tail.rotation.set(0, Math.atan2(dx, dz) + Math.PI / 2, Math.PI / 2);
      }
      // point rouge et son faisceau
      dot.visible = st.laserOn; beam.visible = st.laserOn;
      if (st.laserOn) {
        const p = S.dotAt(t - st.laserT0);
        dot.position.set(p.x, FL + 0.06, p.z);
        dot.scale.setScalar(1 + Math.sin(t * 14) * 0.08);
        const a = new THREE.Vector3(PJ.x + 1.3, PJ.y, PJ.z), b = new THREE.Vector3(p.x, FL + 0.08, p.z);
        beam.position.copy(a).add(b).multiplyScalar(0.5); beam.scale.set(1, a.distanceTo(b), 1);
        beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize());
      }
      lens.material.color.setHex(st.laserOn ? 0xff3040 : 0x6a2a30);
      // chats de la salle
      for (const c of hallCats) {
        c.hop = Math.max(0, c.hop - dt);
        const hy = c.hop > 0 ? Math.sin((1 - c.hop / 0.5) * Math.PI) * 0.6 : 0;
        c.m.position.set(c.x, FL + Math.max(0, hy), c.z);
        c.m.rotation.y = c.yaw;
        const u = c.m.userData, sleeping = !c.moving && !st.laserOn;
        if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = c.moving ? Math.sin(c.phase * 3 + (i % 2 ? Math.PI : 0)) * 0.8 : sleeping ? (i < 2 ? -1.2 : 1.2) * 0.6 : 0; });
        c.m.scale.y = 0.92 * (sleeping ? 0.82 : 1);
        if (u.tail) u.tail.rotation.x = Math.sin(t * (sleeping ? 1.5 : 7) + c.phase) * (sleeping ? 0.15 : 0.4);
        if (u.head) u.head.rotation.x = sleeping ? 0.35 : 0;
      }
      if (!st.laserOn && !k.laser && Math.random() < dt * 1.2) game.spawnParticle((Math.random() - 0.5) * 4, FL + 1.3, -31.4, 0, 0.6, 0, 0xffffff, 0.16, 1.4, -0.2);
      // Pompon : il regarde le chien le plus proche, et fait coucou
      {
        const sg = pompSt.stage, P = game.nearestPlayer(new THREE.Vector3(pompSt.x, pompSt.y, pompSt.z));
        const party = sg === 5;
        const px = party ? pompSt.x + Math.cos(t * 0.8) * 1.2 : pompSt.x, pz = party ? pompSt.z + Math.sin(t * 0.8) * 1.2 : pompSt.z;
        const hop = party ? Math.abs(Math.sin(t * 5)) * 0.45 : sg === 0 ? Math.abs(Math.sin(t * 3)) * 0.25 : 0;
        pompon.position.set(px, pompSt.y + hop, pz);
        pompon.rotation.y = party ? t * 2 : Math.atan2(P.pos.x - px, P.pos.z - pz);
        const u = pompon.userData;
        if (u.tail) u.tail.rotation.x = Math.sin(t * 6) * 0.4;
        if (u.legs && u.legs[0]) u.legs[0].rotation.x = sg === 0 || Math.hypot(P.pos.x - px, P.pos.z - pz) < 4 ? -1.6 + Math.sin(t * 9) * 0.5 : 0;
      }
      // la Capitaine
      {
        const sitting = C.ph === 'throne' || (C.ph === 'talk' && !cs().party && (cs().tags || 0) < S.TAGS);
        let x = C.x, z = C.z, y = C.y, yaw = C.yaw;
        if (sitting) { x = S.CAPTAIN.x; z = S.CAPTAIN.z; y = S.CAPTAIN.y - 0.25; yaw = 0; }
        if (C.ph === 'party') { const a = t * 0.6; x = S.PARTY.x + Math.cos(a) * 1.6; z = S.PARTY.z + Math.sin(a) * 1.0; y = TOPY + Math.abs(Math.sin(t * 4.5)) * 0.5; yaw = a + Math.PI; }
        const hop = C.hop > 0 ? Math.sin((1 - C.hop / 0.7) * Math.PI) * 0.9 : 0;
        cap.position.set(x, y + Math.max(0, hop), z);
        cap.rotation.y = yaw;
        const u = cap.userData;
        const run = C.ph === 'tag';
        if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = run ? Math.sin(t * 16 + (i % 2 ? Math.PI : 0)) * 0.8 : sitting ? (i < 2 ? 0 : 1.1) : Math.sin(t * 9 + i) * 0.3; });
        if (u.tail) u.tail.rotation.x = Math.sin(t * (run ? 9 : 2)) * 0.35;
        if (u.head) u.head.rotation.z = C.ph === 'party' ? Math.sin(t * 4.5) * 0.25 : sitting ? Math.sin(t * 0.8) * 0.06 : Math.sin(t * 6) * 0.12;
        cap.visible = true;
      }
      // la fête
      const party = !!k.party;
      partyLight.visible = party;
      for (const m of partyDeco) m.visible = party;
      if (party) {
        partyLight.rotation.y = t * 1.2;
        for (const g of guests) {
          g.m.visible = true;
          const a = t * 0.5 + g.ph, bob = Math.abs(Math.sin(t * 4 + g.ph)) * 0.35;
          g.m.position.set(g.x + Math.cos(a) * 0.4, TOPY + bob, g.z + Math.sin(a) * 0.4);
          g.m.rotation.y = Math.sin(t * 1.5 + g.ph) * 1.2 + Math.atan2(S.PARTY.x - g.x, S.PARTY.z - g.z);
          const u = g.m.userData;
          if (u.legs) u.legs.forEach((l, i) => { l.rotation.x = Math.sin(t * 8 + i + g.ph) * 0.5; });
          if (u.tail) u.tail.rotation.x = Math.sin(t * 10 + g.ph) * 0.5;
        }
        // les cousins chats viennent danser aussi (ils ont laissé le point rouge)
        hallCats.forEach((c, i) => {
          const a = i / hallCats.length * Math.PI * 2 + t * 0.7;
          c.m.position.set(S.PARTY.x + Math.cos(a) * 3.4, TOPY + Math.abs(Math.sin(t * 5 + i)) * 0.4, S.PARTY.z + Math.sin(a) * 2.2);
          c.m.rotation.y = a + Math.PI;
          c.m.scale.y = 0.92;
        });
      } else for (const g of guests) g.m.visible = false;
      // drapeaux
      flags.forEach((f, i) => {
        const up = i <= st.cp ? 1 : 0;
        f.raise += (up - f.raise) * Math.min(1, dt * 3);
        f.cloth.position.y = 1.0 + f.raise * 2.3;
        f.cloth.material.color.setHex(up ? 0xffffff : 0x9a9a9a);
        const arr = f.cloth.geometry.attributes.position.array;
        for (let q = 0; q < arr.length; q += 3) { const x = f.base[q]; arr[q + 2] = Math.sin(x * 3 - t * 6 + i) * 0.12 * x; }
        f.cloth.geometry.attributes.position.needsUpdate = true;
        const since = t - f.raisedAt;
        f.halo.material.opacity = since < 1.5 ? (1 - since / 1.5) * 0.8 : (i === st.cp ? 0.25 + Math.sin(t * 3) * 0.08 : 0);
        f.halo.scale.setScalar(since < 1.5 ? 1 + since * 2 : 1);
      });
      // torches qui vacillent, statue de la fontaine
      glowMat.size = 2.6 + Math.sin(t * 13) * 0.15 + Math.sin(t * 7.3) * 0.12;
      flameMesh.scale.y = 1 + Math.sin(t * 17) * 0.04;
      for (const l of lamps) l.intensity = 14 + Math.sin(t * 9 + l.position.z) * 1.2;
      statue.rotation.y = 0.6 + Math.sin(t * 0.8) * 0.15;
      if (Math.random() < dt * 8) game.spawnParticle(F.x + (Math.random() - 0.5) * 0.3, FL + 2.6, F.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 2, 2.5, (Math.random() - 0.5) * 2, 0xbfeaff, 0.14, 0.7, 9);
    },
  };
  // état de départ (sauvegarde) et pelotes déjà calées
  if (cs().bridge) { balls[0].slot = null; }
  if (cs().wall) { balls[1].x = S.SLOT.x; balls[1].z = S.SLOT.z; balls[1].slot = 'wall'; balls[1].lx = balls[1].x; balls[1].lz = balls[1].z; }
  for (const b of balls) { b.col.x = b.x; b.col.z = b.z; }
  stepPompon();
  return logic;
}
