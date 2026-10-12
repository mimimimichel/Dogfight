/*
 * Matcha & Ainu — Niveau 3 « Port-Croquette » : décor de la ville, karts
 * conduisibles et missions (livraison, course, voleur, affiches, Capitaine).
 * Le moteur commun est dans game.js ; les données dans level3.js.
 */
import * as THREE from '../vendor/three.module.min.js';
import { L } from './current.js';
import * as M from './models.js';
import { buildCaptain } from './forest.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
const angDiff = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
const hex = (c) => '#' + c.toString(16).padStart(6, '0');
const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };

// Kart
const K = { MAX: 18, BOOST: 27, ACC: 15, BRAKE: 34, COAST: 7, REV: -7, TURN: 2.5, R: 1.05, HOP: 7.5, GRAV: 32 };

/** Pièce d'or (remplace l'os du niveau 1). */
export function coinGeometry() {
  const g = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 22);
  g.rotateX(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Géométrie maison : quadrilatères avec UV et couleurs (tout est fusionné)
// ---------------------------------------------------------------------------
class Geo {
  constructor() { this.p = []; this.n = []; this.uv = []; this.c = []; }
  quad(a, b, c, d, nrm, uvs, col) {
    const C = new THREE.Color(col);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      const v = [a, b, c, d][i];
      this.p.push(v[0], v[1], v[2]); this.n.push(nrm[0], nrm[1], nrm[2]);
      this.uv.push(uvs[i * 2], uvs[i * 2 + 1]); this.c.push(C.r, C.g, C.b);
    }
  }
  tri(a, b, c, col) {
    const v1 = new THREE.Vector3(...b).sub(new THREE.Vector3(...a)), v2 = new THREE.Vector3(...c).sub(new THREE.Vector3(...a));
    const n = v1.cross(v2).normalize();
    const C = new THREE.Color(col);
    for (const v of [a, b, c]) { this.p.push(...v); this.n.push(n.x, n.y, n.z); this.uv.push(v[0] / 4, v[2] / 4); this.c.push(C.r, C.g, C.b); }
  }
  /** Rectangle horizontal (dessus), UV en coordonnées du monde / s. */
  top(x0, x1, z0, z1, y, col, s) {
    s = s || 4;
    this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0], [x0 / s, z1 / s, x1 / s, z1 / s, x1 / s, z0 / s, x0 / s, z0 / s], col);
  }
  /** Mur vertical de (ax, az) à (bx, bz), visible du côté gauche du segment (vu du dessus). u : mètres / su, v : mètres / sv. */
  wall(ax, az, bx, bz, y0, y1, col, su, sv, v0) {
    const len = Math.hypot(bx - ax, bz - az), nx = -(bz - az) / len, nz = (bx - ax) / len;
    su = su || 3; sv = sv || 3; v0 = v0 || 0;
    const u1 = len / su, va = v0, vb = v0 + (y1 - y0) / sv;
    this.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [nx, 0, nz], [0, va, u1, va, u1, vb, 0, vb], col);
  }
  /** Boîte pleine (6 faces), murs dans le sens des aiguilles vus du dessus. */
  box(x0, x1, y0, y1, z0, z1, col, s) {
    s = s || 3;
    this.wall(x0, z1, x1, z1, y0, y1, col, s, s);
    this.wall(x1, z1, x1, z0, y0, y1, col, s, s);
    this.wall(x1, z0, x0, z0, y0, y1, col, s, s);
    this.wall(x0, z0, x0, z1, y0, y1, col, s, s);
    this.top(x0, x1, z0, z1, y1, col, s);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere();
    return g;
  }
}

// ---------------------------------------------------------------------------
// Textures peintes
// ---------------------------------------------------------------------------
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat !== false) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = 4;
  return t;
}
let seed = 7;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function speckle(x, w, h, n, cols) { for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(rnd() * w, rnd() * h, 2, 2); } }

const roadTex = () => canvasTex(64, 128, (x, w, h) => {
  x.fillStyle = '#5a5e68'; x.fillRect(0, 0, w, h);
  speckle(x, w, h, 500, ['#4e525c', '#666a74', '#53575f']);
  x.fillStyle = '#e8e8e0'; x.fillRect(2, 0, 2, h); x.fillRect(w - 4, 0, 2, h);
  x.fillStyle = '#f2d24a'; x.fillRect(w / 2 - 1.5, 0, 3, h * 0.55);
});
const asphaltTex = () => canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#5a5e68'; x.fillRect(0, 0, w, h); speckle(x, w, h, 300, ['#4e525c', '#666a74']); });
const tileTex = (base, line) => canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  speckle(x, w, h, 400, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.08)']);
  x.strokeStyle = line; x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 32); x.lineTo(w, i * 32); x.stroke(); }
});
const cobbleTex = () => canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#c8a878'; x.fillRect(0, 0, w, h);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const l = 190 + Math.floor(rnd() * 40);
    x.fillStyle = `rgb(${l + 20},${l - 5},${l - 45})`;
    x.beginPath(); x.roundRect(i * 16 + (j % 2) * 8 + 1, j * 16 + 1, 14, 14, 4); x.fill();
  }
});
const woodTex = () => canvasTex(64, 128, (x, w, h) => {
  for (let i = 0; i < 4; i++) { const l = 150 + Math.floor(rnd() * 30); x.fillStyle = `rgb(${l},${l - 40},${l - 85})`; x.fillRect(i * 16, 0, 15, h); }
  x.fillStyle = 'rgba(60,30,10,0.5)'; for (let i = 0; i < 4; i++) x.fillRect(i * 16 + 15, 0, 1, h);
  x.fillStyle = 'rgba(60,30,10,0.35)'; for (let i = 0; i < 12; i++) x.fillRect(Math.floor(rnd() * 4) * 16 + 7, rnd() * h, 2, 2);
});
const windowsTex = () => canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  speckle(x, w, h, 300, ['rgba(0,0,0,0.04)']);
  x.fillStyle = '#e8e2d8'; x.fillRect(0, h - 10, w, 6);            // corniche d'étage
  x.fillStyle = '#f8f4ee'; x.fillRect(30, 18, 68, 80);             // encadrement
  x.fillStyle = '#2c4a6a'; x.fillRect(36, 24, 56, 68);              // vitre
  x.fillStyle = 'rgba(255,255,255,0.35)'; x.beginPath(); x.moveTo(40, 88); x.lineTo(70, 28); x.lineTo(82, 28); x.lineTo(52, 88); x.fill();
  x.fillStyle = '#f8f4ee'; x.fillRect(62, 24, 4, 68); x.fillRect(36, 54, 56, 4);
  x.fillStyle = '#d8d0c4'; x.fillRect(26, 98, 76, 6);               // appui
  x.fillStyle = '#7a5a48'; x.fillRect(16, 22, 12, 72); x.fillRect(100, 22, 12, 72);   // volets
  x.fillStyle = 'rgba(0,0,0,0.18)'; for (let i = 0; i < 6; i++) { x.fillRect(16, 26 + i * 12, 12, 2); x.fillRect(100, 26 + i * 12, 12, 2); }
});
const shopTex = () => canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#d8d2c8'; x.fillRect(0, h - 14, w, 14);            // soubassement
  x.fillStyle = '#efe8dc'; x.fillRect(8, 22, 112, 92);
  x.fillStyle = '#334f6c'; x.fillRect(14, 30, 58, 80);              // vitrine
  x.fillStyle = 'rgba(255,240,200,0.5)'; x.fillRect(18, 74, 50, 30);  // étalage éclairé
  x.fillStyle = 'rgba(255,255,255,0.3)'; x.beginPath(); x.moveTo(20, 100); x.lineTo(46, 34); x.lineTo(56, 34); x.lineTo(30, 100); x.fill();
  x.fillStyle = '#6a3e2a'; x.fillRect(80, 40, 34, 74);             // porte
  x.fillStyle = '#e0b040'; x.beginPath(); x.arc(108, 80, 3, 0, 7); x.fill();
  x.fillStyle = '#3a5a7a'; x.fillRect(84, 46, 26, 26);
  x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(8, 20, 112, 4);
});
const roofTex = () => canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); speckle(x, w, h, 600, ['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.06)', 'rgba(255,255,255,0.3)']); });
const stripeTex = (a, b, n) => canvasTex(128, 16, (x, w, h) => { for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * w / n, 0, w / n + 1, h); } });

function textTexture(lines, opts) {
  opts = Object.assign({ w: 512, h: 128, bg: '#2a3a5a', fg: '#ffffff', font: 64, border: '#f0d070' }, opts || {});
  return canvasTex(opts.w, opts.h, (x, w, h) => {
    x.fillStyle = opts.bg; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 18); x.fill();
    if (opts.border) { x.strokeStyle = opts.border; x.lineWidth = 6; x.stroke(); }
    x.fillStyle = opts.fg; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `bold ${opts.font}px Fredoka, "Arial Rounded MT Bold", Arial, sans-serif`;
    const rows = [].concat(lines);
    rows.forEach((t, i) => x.fillText(t, w / 2, h / 2 + (i - (rows.length - 1) / 2) * opts.font * 1.05));
  }, false);
}
function plane(tex, w, h, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.7, transparent: true, alphaTest: 0.05 }, opts || {})));
  m.userData.noOutline = true;
  return m;
}

/** Affiche « Vive la Capitaine Moustache ! » à arracher. */
function posterTexture() {
  return canvasTex(256, 320, (x, w, h) => {
    x.fillStyle = '#f4e4c0'; x.fillRect(0, 0, w, h);
    x.strokeStyle = '#8a2a3a'; x.lineWidth = 10; x.strokeRect(8, 8, w - 16, h - 16);
    x.fillStyle = '#8a2a3a'; x.textAlign = 'center';
    x.font = 'bold 34px Fredoka, Arial, sans-serif'; x.fillText('VIVE LA', w / 2, 52);
    x.font = 'bold 30px Fredoka, Arial, sans-serif'; x.fillText('CAPITAINE', w / 2, 268); x.fillText('MOUSTACHE !', w / 2, 300);
    // tête de chat au bicorne
    x.fillStyle = '#9a9ab0'; x.beginPath(); x.arc(w / 2, 160, 62, 0, 7); x.fill();
    x.beginPath(); x.moveTo(w / 2 - 60, 130); x.lineTo(w / 2 - 44, 70); x.lineTo(w / 2 - 18, 108); x.fill();
    x.beginPath(); x.moveTo(w / 2 + 60, 130); x.lineTo(w / 2 + 44, 70); x.lineTo(w / 2 + 18, 108); x.fill();
    x.fillStyle = '#23202c'; x.beginPath(); x.ellipse(w / 2, 98, 74, 24, 0, Math.PI, 0); x.fill();
    x.fillStyle = '#ffc830'; x.beginPath(); x.arc(w / 2, 86, 7, 0, 7); x.fill();
    x.fillStyle = '#111'; x.beginPath(); x.arc(w / 2 - 22, 150, 8, 0, 7); x.fill();
    x.beginPath(); x.arc(w / 2 + 22, 150, 13, 0, 7); x.fill();
    x.strokeStyle = '#2a2430'; x.lineWidth = 7; x.lineCap = 'round';
    x.beginPath(); x.moveTo(w / 2, 185); x.quadraticCurveTo(w / 2 - 40, 200, w / 2 - 56, 172); x.stroke();
    x.beginPath(); x.moveTo(w / 2, 185); x.quadraticCurveTo(w / 2 + 40, 200, w / 2 + 56, 172); x.stroke();
  }, false);
}

// ---------------------------------------------------------------------------
// Karts, habitants, voleur
// ---------------------------------------------------------------------------
export function buildKart(color) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const paint = M.mat(color, { roughness: 0.35, metalness: 0.2 });
  const dark = M.mat(0x22242c, { roughness: 0.6 });
  const chrome = M.mat(0xd8dce4, { roughness: 0.25, metalness: 0.8 });
  // pièces regroupées par matériau puis fusionnées : 4 maillages au lieu de 25
  const parts = new Map();
  const add = (geo, m, x, y, z, rx, rz) => { if (!parts.has(m)) parts.set(m, []); parts.get(m).push({ geo, x, y, z, rx: rx || 0, rz: rz || 0 }); return null; };
  add(new THREE.BoxGeometry(1.5, 0.42, 2.2), paint, 0, 0.5, -0.05);
  add(new THREE.BoxGeometry(1.15, 0.3, 0.7), paint, 0, 0.48, 1.25);
  add(new THREE.CylinderGeometry(0.58, 0.58, 0.32, 18, 1, false, 0, Math.PI), paint, 0, 0.42, 1.58, Math.PI / 2, Math.PI / 2);
  add(new THREE.BoxGeometry(1.6, 0.18, 0.3), dark, 0, 0.36, 1.62);            // pare-chocs
  add(new THREE.BoxGeometry(1.0, 0.55, 0.18), dark, 0, 0.98, -0.62);          // dossier
  add(new THREE.BoxGeometry(1.0, 0.14, 0.8), dark, 0, 0.74, -0.25);           // siège
  add(new THREE.TorusGeometry(0.2, 0.04, 8, 20), dark, 0, 1.0, 0.5, -0.9);
  add(new THREE.CylinderGeometry(0.03, 0.03, 0.45, 6), dark, 0, 0.82, 0.62, -0.9);
  // aileron
  add(new THREE.BoxGeometry(1.7, 0.07, 0.38), paint, 0, 1.22, -1.1);
  for (const sx of [-0.55, 0.55]) add(new THREE.BoxGeometry(0.07, 0.42, 0.12), dark, sx, 1.0, -1.1);
  for (const sx of [-0.35, 0.35]) add(new THREE.CylinderGeometry(0.07, 0.09, 0.4, 10), chrome, sx, 0.52, -1.3, Math.PI / 2);
  // phares
  for (const sx of [-0.4, 0.4]) add(new THREE.SphereGeometry(0.1, 10, 8), M.mat(0xfff6d0, { emissive: 0xfff0b0, emissiveIntensity: 0.8 }), sx, 0.6, 1.6);
  for (const [m, list] of parts) { const o = new THREE.Mesh(M.mergeGeos(list), m); o.castShadow = true; body.add(o); }
  // roues
  const wheels = [];
  const tire = new THREE.CylinderGeometry(0.36, 0.36, 0.32, 18); tire.rotateZ(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.16, 0.16, 0.34, 10); hub.rotateZ(Math.PI / 2);
  const hubGeo = M.mergeGeos([{ geo: hub }, { geo: new THREE.BoxGeometry(0.35, 0.05, 0.3) }]);
  for (const [x, z] of [[-0.85, 0.82], [0.85, 0.82], [-0.85, -0.78], [0.85, -0.78]]) {
    const w = new THREE.Group(); w.position.set(x, 0.36, z);
    const t = new THREE.Mesh(tire, dark); t.castShadow = true; w.add(t);
    w.add(new THREE.Mesh(hubGeo, chrome));
    g.add(w); wheels.push(w);
  }
  // flammes du turbo
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0x6ad0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.scale.set(1.2, 1.2, 1); flame.position.set(0, 0.55, -1.6); g.add(flame);
  g.userData = { body, wheels, flame };
  return g;
}

function hat(kind) {
  const g = new THREE.Group();
  if (kind === 'baker') {
    const w = M.mat(0xffffff, { roughness: 0.8 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.16, 18), w); band.position.y = 0.26;
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.27, 16, 12), w); puff.scale.set(1, 0.7, 1); puff.position.y = 0.42;
    g.add(band, puff);
  } else if (kind === 'mechanic') {
    const r = M.mat(0xd83a3a, { roughness: 0.6 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), r); dome.position.y = 0.18;
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), r); visor.position.set(0, 0.19, 0.12); visor.scale.set(1, 1, 1.2);
    g.add(dome, visor);
  } else if (kind === 'police') {
    const b = M.mat(0x2a4ab0, { roughness: 0.5 }), k = M.mat(0x14182a, { roughness: 0.5 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.2, 20), b); top.position.y = 0.33;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.245, 0.245, 0.07, 20), k); band.position.y = 0.22;
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.025, 16, 1, false, -Math.PI / 2, Math.PI), k); visor.position.set(0, 0.2, 0.1); visor.scale.set(1, 1, 1.3);
    const badge = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), M.GOLD()); badge.position.set(0, 0.32, 0.27);
    g.add(top, band, visor, badge);
  } else if (kind === 'mayor') {
    const k = M.mat(0x1a1a22, { roughness: 0.5 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16), k); crown.position.y = 0.38;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 18), k); brim.position.y = 0.23;
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.06, 16), M.mat(0x8a3ad0)); ribbon.position.y = 0.27;
    g.add(crown, brim, ribbon);
  }
  return g;
}

function buildCitizen(look) {
  let m;
  if (look === 'baker') m = M.buildPug({ fur: 0xd8b088, mask: 0x5a3a28, belly: 0xf0dcc0, collar: 0xffffff, scale: 1.55 });
  else if (look === 'mechanic') m = M.buildYorkie({ bow: null, steel: 0x6a6070, tan: 0xd0a070, scale: 1.65 });
  else if (look === 'police') m = M.buildPug({ fur: 0x50505c, mask: 0x18181e, belly: 0x6a6a76, collar: 0x2a4ab0, scale: 1.6 });
  else m = M.buildYorkie({ bow: 0x8a3ad0, steel: 0x7a6a8a, tan: 0xe0b890, scale: 1.55 });
  const u = m.userData;
  const h = hat(look); u.mhead.add(h);
  if (look === 'mayor') {
    const sash = new THREE.Mesh(new THREE.TorusGeometry(0.26, 0.035, 6, 24), M.mat(0x3a6ae0));
    sash.rotation.set(Math.PI / 2, 0.6, 0); sash.position.set(0, 0.46, 0.02); u.matcha.children[0].add(sash);
  }
  if (look === 'mechanic') {
    const wrench = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.36), M.mat(0xc8ccd4, { metalness: 0.7, roughness: 0.3 }));
    wrench.position.set(0.22, 0.45, 0.2); u.matcha.children[0].add(wrench);
  }
  return m;
}

function buildThief() {
  const cat = M.buildCat();
  const u = cat.userData;
  const mask = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.06, 6, 28), M.mat(0x111118));
  mask.rotation.x = Math.PI / 2; mask.position.y = 0.06; mask.scale.set(1.12, 1, 0.98); u.head.add(mask);
  const sack = new THREE.Mesh(new THREE.SphereGeometry(0.32, 14, 10), M.mat(0xb08a50, { roughness: 0.9 }));
  sack.position.set(0, 0.85, -0.25); sack.scale.set(1, 1.1, 0.9); cat.add(sack);
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), M.mat(0x8a6a38)); knot.position.set(0, 1.18, -0.25); cat.add(knot);
  const dollar = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 16), M.GOLD()); dollar.position.set(0, 0.88, 0.05); cat.add(dollar);
  cat.scale.setScalar(1.15);
  return cat;
}

function buildBoat(color) {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.9, 5.2, 12, 1, false, 0, Math.PI), M.mat(color, { roughness: 0.5 }));
  hull.rotation.set(Math.PI / 2, Math.PI / 2, 0); hull.scale.set(1, 1, 0.8); hull.position.y = 0.2;
  const deck = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.12, 5.0), M.mat(0xd8b080, { roughness: 0.8 })); deck.position.y = 0.22;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.0, 1.6), M.mat(0xf8f4ec, { roughness: 0.6 })); cabin.position.set(0, 0.8, -0.6);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 4, 8), M.mat(0x8a6a48)); mast.position.set(0, 2.2, 0.8);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.5), M.mat(0xffd040, { side: THREE.DoubleSide })); flag.position.set(0.4, 3.9, 0.8);
  for (const o of [hull, deck, cabin, mast, flag]) { o.castShadow = true; g.add(o); }
  return g;
}

function beaconMaterial(color) {
  const t = canvasTex(4, 128, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 128);
  }, false);
  return new THREE.MeshBasicMaterial({ color, map: t, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
}

// ===========================================================================
export function buildCity(game) {
  const sc = game.scene, lite = game.lite;
  const S = L;
  const G = S.GROUND;
  const moving = [], chars = [];
  const shadowy = (o) => { o.traverse(k => { if (k.isMesh) { k.castShadow = !lite; k.receiveShadow = true; } }); return o; };

  // --- Sol : trottoirs, place, rues, passages piétons --------------------------
  const slab = new Geo(), plazaG = new Geo(), skateG = new Geo();
  const slabBox = (geo, x0, x1, z0, z1, col) => {
    geo.top(x0, x1, z0, z1, G + 0.06, col, 4);
    geo.wall(x0, z1, x1, z1, G - 0.3, G + 0.06, col, 4, 1); geo.wall(x1, z1, x1, z0, G - 0.3, G + 0.06, col, 4, 1);
    geo.wall(x1, z0, x0, z0, G - 0.3, G + 0.06, col, 4, 1); geo.wall(x0, z0, x0, z1, G - 0.3, G + 0.06, col, 4, 1);
  };
  for (const b of S.BLOCKS) {
    if (b.type === 'park') {
      const r = S.PARK;
      slabBox(slab, b.x0, b.x1, b.z0, r.z0, 0xffffff); slabBox(slab, b.x0, b.x1, r.z1, b.z1, 0xffffff);
      slabBox(slab, b.x0, r.x0, r.z0, r.z1, 0xffffff); slabBox(slab, r.x1, b.x1, r.z0, r.z1, 0xffffff);
    } else if (b.type === 'plaza' || b.type === 'market') slabBox(plazaG, b.x0, b.x1, b.z0, b.z1, 0xffffff);
    else if (b.type === 'skate' || b.type === 'garage') slabBox(skateG, b.x0, b.x1, b.z0, b.z1, b.type === 'skate' ? 0xd8d8dc : 0xb0aca8);
    else slabBox(slab, b.x0, b.x1, b.z0, b.z1, 0xffffff);
  }
  slabBox(slab, S.CITY.x0, S.CITY.x1, S.BOULEVARD + S.ROAD_HW, S.QUAY_Z, 0xf4ece0);   // promenade
  const add = (geo, mat, opts) => { const m = new THREE.Mesh(geo.build ? geo.build() : geo, mat); m.receiveShadow = true; if (opts && opts.cast) m.castShadow = !lite; sc.add(m); return m; };
  add(slab, new THREE.MeshStandardMaterial({ map: tileTex('#dcd6cc', 'rgba(120,110,100,0.35)'), vertexColors: true, roughness: 0.9 }));
  add(plazaG, new THREE.MeshStandardMaterial({ map: cobbleTex(), vertexColors: true, roughness: 0.9 }));
  add(skateG, new THREE.MeshStandardMaterial({ map: tileTex('#c8c8cc', 'rgba(90,90,100,0.3)'), vertexColors: true, roughness: 0.85 }));

  // rues : tronçons entre les carrefours (marquage), carrefours unis, passages piétons
  const roadG = new Geo(), crossG = new Geo(), zebraG = new Geo();
  const HW = S.ROAD_HW, Y = G + 0.03;
  const xsCross = S.AVENUES, zsCross = [...S.STREETS, S.BOULEVARD];
  const segs = (lo, hi, cuts) => { const pts = [lo, ...cuts.filter(c => c > lo && c < hi).flatMap(c => [c - HW, c + HW]), hi]; const out = []; for (let i = 0; i < pts.length; i += 2) if (pts[i + 1] - pts[i] > 0.1) out.push([pts[i], pts[i + 1]]); return out; };
  for (const x of S.AVENUES) for (const [z0, z1] of segs(S.CITY.z0, S.BOULEVARD + HW, zsCross)) {
    const L0 = z0 / 8, L1 = z1 / 8;
    roadG.quad([x - HW, Y, z1], [x + HW, Y, z1], [x + HW, Y, z0], [x - HW, Y, z0], [0, 1, 0], [0, L1, 1, L1, 1, L0, 0, L0], 0xffffff);
  }
  for (const z of zsCross) for (const [x0, x1] of segs(S.CITY.x0, S.CITY.x1, xsCross)) {
    const L0 = x0 / 8, L1 = x1 / 8;
    roadG.quad([x0, Y, z + HW], [x1, Y, z + HW], [x1, Y, z - HW], [x0, Y, z - HW], [0, 1, 0], [1, L0, 1, L1, 0, L1, 0, L0], 0xffffff);
  }
  for (const x of xsCross) for (const z of zsCross) {
    crossG.top(x - HW, x + HW, z - HW, z + HW, Y + 0.004, 0xffffff, 4);
    // passages piétons sur les 4 côtés
    for (let i = -3; i <= 3; i++) {
      const o = i * 1.1;
      zebraG.top(x + o - 0.35, x + o + 0.35, z - HW - 2.6, z - HW - 0.4, Y + 0.008, 0xf4f4f0, 4);
      zebraG.top(x + o - 0.35, x + o + 0.35, z + HW + 0.4, z + HW + 2.6, Y + 0.008, 0xf4f4f0, 4);
      if (z === S.BOULEVARD) continue;
      zebraG.top(x - HW - 2.6, x - HW - 0.4, z + o - 0.35, z + o + 0.35, Y + 0.008, 0xf4f4f0, 4);
      zebraG.top(x + HW + 0.4, x + HW + 2.6, z + o - 0.35, z + o + 0.35, Y + 0.008, 0xf4f4f0, 4);
    }
  }
  const roadMat = new THREE.MeshStandardMaterial({ map: roadTex(), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  add(roadG, roadMat);
  add(crossG, new THREE.MeshStandardMaterial({ map: asphaltTex(), roughness: 0.92, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  add(zebraG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }));

  // --- Immeubles -----------------------------------------------------------------
  const shopG = new Geo(), upG = new Geo(), roofG = new Geo(), trimG = new Geo();
  const GF = 3.4;    // hauteur du rez-de-chaussée
  for (const b of S.buildings) {
    const { x0, x1, z0, z1 } = b, top = b.top;
    const sides = [[x0, z1, x1, z1], [x1, z1, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, z1]];
    for (const [ax, az, bx, bz] of sides) {
      shopG.wall(ax, az, bx, bz, G, G + GF, b.color, 3.4, GF);
      upG.wall(ax, az, bx, bz, G + GF, top - 0.4, b.color, 3, 3);
    }
    roofG.top(x0, x1, z0, z1, top, b.roof, 4);
    // corniche en haut, bandeau entre le rez-de-chaussée et les étages
    const o = 0.25, tc = new THREE.Color(b.color).multiplyScalar(0.82).getHex();
    trimG.box(x0 - o, x1 + o, top - 0.4, top + 0.05, z0 - o, z1 + o, tc, 2);
    trimG.top(x0 - o, x1 + o, z0 - o, z1 + o, top + 0.05, b.roof, 4);
    trimG.box(x0 - 0.12, x1 + 0.12, G + GF - 0.15, G + GF + 0.1, z0 - 0.12, z1 + 0.12, tc, 2);
  }
  // beffroi de l'hôtel de ville
  const HT = S.HALL.tower;
  {
    const x0 = HT.x - HT.w / 2, x1 = HT.x + HT.w / 2, z0 = HT.z - HT.d / 2, z1 = HT.z + HT.d / 2;
    for (const [ax, az, bx, bz] of [[x0, z1, x1, z1], [x1, z1, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, z1]]) upG.wall(ax, az, bx, bz, S.HALL.b.top, HT.y1, 0xf2e6d0, 3, 3);
    trimG.box(x0 - 0.3, x1 + 0.3, HT.y1, HT.y1 + 0.3, z0 - 0.3, z1 + 0.3, 0x5a6a80, 2);
  }
  add(shopG, new THREE.MeshStandardMaterial({ map: shopTex(), vertexColors: true, roughness: 0.85 }), { cast: true });
  add(upG, new THREE.MeshStandardMaterial({ map: windowsTex(), vertexColors: true, roughness: 0.85 }), { cast: true });
  add(roofG, new THREE.MeshStandardMaterial({ map: roofTex(), vertexColors: true, roughness: 0.95 }));
  add(trimG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), { cast: true });
  // toit pointu du beffroi + horloge
  {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.1, 4, 4), M.mat(0x4a5a78, { roughness: 0.7 }));
    cone.rotation.y = Math.PI / 4; cone.position.set(HT.x, HT.y1 + 2.3, HT.z);
    sc.add(shadowy(cone));
    const clock = canvasTex(128, 128, (x) => {
      x.fillStyle = '#fff8e8'; x.beginPath(); x.arc(64, 64, 60, 0, 7); x.fill();
      x.strokeStyle = '#3a3a48'; x.lineWidth = 6; x.stroke();
      for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; x.fillStyle = '#3a3a48'; x.fillRect(64 + Math.cos(a) * 48 - 3, 64 + Math.sin(a) * 48 - 3, 6, 6); }
    }, false);
    for (let i = 0; i < 4; i++) {
      const p = plane(clock, 2.6, 2.6); const a = i * Math.PI / 2;
      p.position.set(HT.x + Math.sin(a) * 2.03, HT.y1 - 2, HT.z + Math.cos(a) * 2.03); p.rotation.y = a; sc.add(p);
    }
    // aiguilles (tournent)
    var hands = [];
    for (let i = 0; i < 2; i++) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.12, i ? 1.0 : 0.7, 0.05), M.mat(0x2a2a34)); h.geometry.translate(0, (i ? 1.0 : 0.7) / 2, 0); h.position.set(HT.x, HT.y1 - 2, HT.z + 2.1); sc.add(h); hands.push(h); }
  }
  // balcons
  const balcG = new Geo();
  for (const b of S.balconies) {
    balcG.box(b.x - b.w / 2, b.x + b.w / 2, b.top - 0.25, b.top, b.z - b.d / 2, b.z + b.d / 2, 0xf4f0ea, 2);
    // console sous le balcon
    balcG.box(b.x - 0.15, b.x + 0.15, b.top - 0.75, b.top - 0.25, b.z - 0.15, b.z + 0.15, 0xc8c0b4, 2);
  }
  add(balcG, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 }), { cast: true });
  // auvents rebondissants
  const awn = S.awnings.map(a => {
    const g = new THREE.Group();
    const tex = stripeTex(hex(a.color), '#ffffff', 8);
    const along = a.nx === 0;   // façade nord ou sud : l'auvent s'étend le long de x
    const w = along ? a.w : a.d, d = along ? a.d : a.w;
    const canvas = new THREE.Mesh(new THREE.BoxGeometry(along ? w : d, 0.18, along ? d : w), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 }));
    if (!along) canvas.rotation.y = Math.PI / 2;
    canvas.position.y = -0.09;
    const lip = new THREE.Mesh(new THREE.BoxGeometry(along ? w : 0.06, 0.3, along ? 0.06 : w), M.mat(a.color));
    lip.position.set(a.nx * d / 2, -0.25, a.nz * d / 2);
    g.add(canvas, lip);
    g.position.set(a.x, a.top, a.z);
    sc.add(shadowy(g));
    return { def: a, g };
  });
  // enseignes
  const sign = (text, b, opts, y) => {
    const tex = textTexture(text, opts);
    const p = plane(tex, 5.2, 1.3);
    const cx = (b.x0 + b.x1) / 2, cz = (b.z0 + b.z1) / 2;
    const n = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] }[b.side];
    p.position.set(cx + n[0] * ((b.x1 - b.x0) / 2 + 0.06), y || G + GF + 0.9, cz + n[1] * ((b.z1 - b.z0) / 2 + 0.06));
    p.rotation.y = Math.atan2(n[0], n[1]);
    sc.add(p);
  };
  sign('BOULANGERIE', S.BAKERY, { bg: '#8a4a2a', border: '#f8d890' }, G + 4.4);
  sign('GARAGE DE RITA', S.GARAGE, { bg: '#c83a3a', font: 54 }, G + 4.4);
  sign('POLICE', S.POLICE, { bg: '#2a4ab0', border: '#ffffff' }, S.POLICE.top + 0.75);
  sign('HÔTEL DE VILLE', S.HALL.b, { bg: '#f2e6d0', fg: '#3a4a68', border: '#3a4a68', font: 56 }, S.HALL.b.top + 0.75);

  // --- Marché, fontaine, parc --------------------------------------------------------
  for (const s of S.stalls) {
    const g = new THREE.Group();
    const counter = new THREE.Mesh(new THREE.BoxGeometry(s.w, s.top - G, s.d), M.mat(0xa87a50, { roughness: 0.85 }));
    counter.position.y = (s.top - G) / 2;
    const goods = new THREE.Mesh(new THREE.BoxGeometry(s.w - 0.4, 0.2, s.d - 0.6), M.mat([0xf06a3a, 0x7ad04a, 0xf0d040, 0xd04a8a][Math.floor(s.x + s.z) & 3]));
    goods.position.y = s.top - G + 0.1;
    const roof = new THREE.Mesh(new THREE.BoxGeometry(s.w + 0.6, 0.2, s.d + 0.8), new THREE.MeshStandardMaterial({ map: stripeTex(hex(s.color), '#ffffff', 6), roughness: 0.6 }));
    roof.position.y = s.canopy - G - 0.1;
    g.add(counter, goods, roof);
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, s.canopy - s.top, 6), M.mat(0x6a4a30));
      post.position.set(px * (s.w / 2 - 0.1), (s.top + s.canopy) / 2 - G, pz * (s.d / 2 - 0.1)); g.add(post);
    }
    g.position.set(s.x, G, s.z);
    sc.add(shadowy(g));
  }
  const FO = S.FOUNTAIN;
  const fountainWater = new THREE.Mesh(new THREE.CircleGeometry(FO.r - 0.35, 40), new THREE.MeshStandardMaterial({ color: 0x5ad0f0, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.85 }));
  {
    const stone = M.mat(0xe8dcc8, { roughness: 0.8 });
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(FO.r, FO.r + 0.2, FO.top - G + 0.3, 40, 1, true), stone);
    basin.position.set(FO.x, (FO.top + G - 0.3) / 2, FO.z); basin.material.side = THREE.DoubleSide;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(FO.r - 0.15, 0.25, 8, 40), stone);
    rim.rotation.x = Math.PI / 2; rim.position.set(FO.x, FO.top - 0.05, FO.z);
    fountainWater.rotation.x = -Math.PI / 2; fountainWater.position.set(FO.x, FO.top - 0.2, FO.z);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(FO.col * 0.8, FO.col, FO.colTop - G, 16), stone);
    col.position.set(FO.x, (FO.colTop + G) / 2, FO.z);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.5, 0.5, 24), stone);
    bowl.position.set(FO.x, FO.colTop - 1.4, FO.z);
    sc.add(shadowy(basin), shadowy(rim), fountainWater, shadowy(col), shadowy(bowl));
  }
  const statue = new THREE.Mesh(M.boneGeometry(), M.GOLD());
  statue.scale.setScalar(2.6); statue.position.set(FO.x, FO.colTop + 0.5, FO.z);
  sc.add(statue); moving.push(statue);

  const KI = S.KIOSK;
  {
    const wood = M.mat(0xf4ecdc, { roughness: 0.7 });
    const floor = new THREE.Mesh(new THREE.CylinderGeometry(KI.r, KI.r + 0.2, KI.floor - G + 0.3, 8), M.mat(0xc8b8a0, { roughness: 0.9 }));
    floor.position.set(KI.x, (KI.floor + G - 0.3) / 2, KI.z);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(KI.roofR + 0.4, 2.2, 8), new THREE.MeshStandardMaterial({ map: stripeTex('#d84848', '#ffffff', 16), roughness: 0.6 }));
    roof.position.set(KI.x, KI.roof + 0.9, KI.z);
    const slabK = new THREE.Mesh(new THREE.CylinderGeometry(KI.roofR, KI.roofR, 0.4, 8), wood);
    slabK.position.set(KI.x, KI.roof - 0.2, KI.z);
    sc.add(shadowy(floor), shadowy(roof), shadowy(slabK));
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, KI.roof - KI.floor, 8), wood);
      p.position.set(KI.x + Math.cos(a) * 2.6, (KI.roof + KI.floor) / 2 - 0.2, KI.z + Math.sin(a) * 2.6);
      sc.add(shadowy(p));
    }
  }
  // champignon de jeu du parc + auvents : rebonds écrasés
  const mushrooms = S.bouncers.filter(b => b.mushroom).map(b => {
    const g = new THREE.Group();
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.55, b.top - b.base, 12), M.mat(0xf2e6cc));
    st.position.y = (b.top - b.base) / 2;
    const cap = new THREE.Mesh(new THREE.SphereGeometry(b.r * 1.1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.mat(0xff5ab8, { roughness: 0.5, emissive: 0x401030, emissiveIntensity: 0.3 }));
    cap.position.y = b.top - b.base - 0.1; cap.scale.y = 0.6;
    g.add(st, cap); g.position.set(b.x, b.base, b.z);
    sc.add(shadowy(g));
    return { def: b, cap };
  });

  // --- Rampes --------------------------------------------------------------------
  {
    const rg = new Geo();
    for (const c of S.ramps) {
      const x0 = c.x - c.w / 2, x1 = c.x + c.w / 2, z0 = c.z - c.d / 2, z1 = c.z + c.d / 2, y0 = G + 0.04, h = c.h;
      // les 4 coins du dessus, selon le sens de la pente
      const yAt = (x, z) => S.rampTop(c, x, z) + 0.04;
      const A = [x0, yAt(x0, z1), z1], B = [x1, yAt(x1, z1), z1], C = [x1, yAt(x1, z0), z0], D = [x0, yAt(x0, z0), z0];
      const col = 0xf0a030;
      rg.tri(A, B, C, col); rg.tri(A, C, D, col);
      for (const [p, q] of [[A, B], [B, C], [C, D], [D, A]]) {
        if (p[1] - y0 < 0.05 && q[1] - y0 < 0.05) continue;
        rg.tri([p[0], y0, p[2]], [q[0], y0, q[2]], q, 0xd88a20);
        rg.tri([p[0], y0, p[2]], q, p, 0xd88a20);
        // l'autre sens (face visible des deux côtés)
        rg.tri([q[0], y0, q[2]], [p[0], y0, p[2]], p, 0xd88a20);
        rg.tri([q[0], y0, q[2]], p, q, 0xd88a20);
      }
      void h;
    }
    const m = add(rg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, map: stripeTex('#ffffff', '#ffe0a0', 8) }), { cast: true });
    m.material.side = THREE.DoubleSide;
  }

  // --- Port : quai, garde-corps, jetée, phare, bateaux -------------------------------
  {
    const st = new Geo();
    st.box(S.CITY.x0, S.PIER.x0, -4, G + 0.08, S.QUAY_Z, S.QUAY_Z + 0.9, 0xb8ae9e, 2);
    st.box(S.PIER.x1, S.CITY.x1, -4, G + 0.08, S.QUAY_Z, S.QUAY_Z + 0.9, 0xb8ae9e, 2);
    add(st, new THREE.MeshStandardMaterial({ map: tileTex('#c8beae', 'rgba(80,70,60,0.4)'), vertexColors: true, roughness: 0.9 }), { cast: true });
    const rail = new Geo();
    for (const r of S.RAILS) {
      if (r.z0 !== undefined) {
        for (let z = r.z0 + 0.5; z <= r.z1; z += 2.2) rail.box(r.x - 0.07, r.x + 0.07, G, G + 1.0, z - 0.07, z + 0.07, 0x3a5a6a, 1);
        rail.box(r.x - 0.06, r.x + 0.06, G + 0.88, G + 1.0, r.z0, r.z1, 0x3a5a6a, 1);
        rail.box(r.x - 0.04, r.x + 0.04, G + 0.45, G + 0.52, r.z0, r.z1, 0x3a5a6a, 1);
        continue;
      }
      for (let x = r.x0 + 0.5; x <= r.x1; x += 2.2) rail.box(x - 0.07, x + 0.07, G, G + 1.0, r.z - 0.07, r.z + 0.07, 0x3a5a6a, 1);
      rail.box(r.x0, r.x1, G + 0.88, G + 1.0, r.z - 0.06, r.z + 0.06, 0x3a5a6a, 1);
      rail.box(r.x0, r.x1, G + 0.45, G + 0.52, r.z - 0.04, r.z + 0.04, 0x3a5a6a, 1);
    }
    add(rail, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.5 }));
    const F = S.FENCE, fence = new Geo();
    fence.box(F.x0, F.x1, G, F.top, F.z0, F.z1, 0xffffff, F.top - G);
    const graf = canvasTex(256, 64, (x, w, h) => {
      x.fillStyle = '#3a6ad0'; x.fillRect(0, 0, w, h);
      for (let i = 0; i < 16; i++) { x.fillStyle = 'rgba(0,0,0,0.15)'; x.fillRect(i * 16, 0, 2, h); }
      x.font = 'bold 34px Fredoka, Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = '#2a1408'; x.strokeText('SKATE !', w / 2, h / 2); x.fillStyle = '#ffd23a'; x.fillText('SKATE !', w / 2, h / 2);
    });
    add(fence, new THREE.MeshStandardMaterial({ map: graf, vertexColors: true, roughness: 0.8 }), { cast: true });
    const P = S.PIER, deck = new Geo();
    deck.box(P.x0, P.x1, G - 0.5, G + 0.02, P.z0, P.z1, 0xffffff, 3);
    deck.box(P.px0, P.px1, G - 0.5, G + 0.02, P.pz0, P.pz1, 0xffffff, 3);
    add(deck, new THREE.MeshStandardMaterial({ map: woodTex(), vertexColors: true, roughness: 0.85 }), { cast: true });
    const posts = [];
    for (let z = P.z0 + 2; z < P.z1; z += 4) posts.push([P.x0 + 0.3, z], [P.x1 - 0.3, z]);
    for (let x = P.px0 + 0.4; x < P.px1; x += 4) posts.push([x, P.pz0 + 0.3], [x, P.pz1 - 0.3]);
    const pi = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 8), M.mat(0x6a4a30, { roughness: 0.9 }), posts.length);
    const m4 = new THREE.Matrix4();
    posts.forEach(([x, z], i) => { m4.makeTranslation(x, G - 3.6, z); pi.setMatrixAt(i, m4); });
    sc.add(pi);
    // phare rayé
    const LH = S.LIGHTHOUSE;
    const bands = canvasTex(16, 128, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#d83a3a' : '#fafafa'; x.fillRect(0, i * 16, 16, 16); } }, false);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(LH.r * 0.82, LH.r, LH.top - G - 0.6, 24), new THREE.MeshStandardMaterial({ map: bands, roughness: 0.6 }));
    body.position.set(LH.x, (LH.top - 0.6 + G) / 2, LH.z);
    const gallery = new THREE.Mesh(new THREE.CylinderGeometry(LH.capR, LH.capR, 0.6, 28), M.mat(0x3a3a48, { roughness: 0.5 }));
    gallery.position.set(LH.x, LH.top - 0.3, LH.z);
    const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.6, 16), new THREE.MeshStandardMaterial({ color: 0xfff4c0, emissive: 0xffd060, emissiveIntensity: 0.9, roughness: 0.2 }));
    lantern.position.set(LH.x, LH.top + 0.8, LH.z);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(1.25, 1.2, 16), M.mat(0xd83a3a, { roughness: 0.5 }));
    cap.position.set(LH.x, LH.top + 2.2, LH.z);
    sc.add(shadowy(body), shadowy(gallery), lantern, shadowy(cap));
    var beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0xfff0a0, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.scale.set(6, 6, 1); beam.position.set(LH.x, LH.top + 0.8, LH.z); sc.add(beam);
    const stepMat = M.mat(0xa87a50, { roughness: 0.85 });
    for (const s of S.lighthouseSteps) {
      const d = new THREE.Mesh(new THREE.CylinderGeometry(s.r, s.r, 0.35, 16), stepMat);
      d.position.set(s.x, s.top - 0.175, s.z); sc.add(shadowy(d));
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 2.2), M.mat(0x3a3a48));
      arm.position.set((s.x + LH.x) / 2, s.top - 0.45, (s.z + LH.z) / 2); arm.rotation.y = Math.atan2(s.x - LH.x, s.z - LH.z); sc.add(arm);
    }
  }
  const boats = S.BOATS.map((b, i) => {
    const m = buildBoat(b.color);
    m.position.set(b.x, 0, b.z); m.rotation.y = b.yaw;
    sc.add(m); moving.push(m);
    return { def: b, m, ph: i * 1.7 };
  });

  // --- Lampadaires et bancs -----------------------------------------------------------
  {
    const spots = [];
    for (const b of S.BLOCKS) for (const [x, z] of [[b.x0 + 0.9, b.z0 + 0.9], [b.x1 - 0.9, b.z0 + 0.9], [b.x0 + 0.9, b.z1 - 0.9], [b.x1 - 0.9, b.z1 - 0.9]]) spots.push([x, z]);
    for (let x = -54; x <= 54; x += 12) if (Math.abs(x - 26) > 9) spots.push([x, S.QUAY_Z - 0.8]);
    const pole = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.12, 4.2, 8), M.mat(0x2a3a4a, { roughness: 0.5, metalness: 0.4 }), spots.length);
    const head = new THREE.InstancedMesh(new THREE.SphereGeometry(0.32, 12, 8), new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe8a0, emissiveIntensity: 0.6 }), spots.length);
    const m4 = new THREE.Matrix4();
    spots.forEach(([x, z], i) => { m4.makeTranslation(x, G + 2.1, z); pole.setMatrixAt(i, m4); m4.makeTranslation(x, G + 4.3, z); head.setMatrixAt(i, m4); });
    pole.castShadow = !lite;
    sc.add(pole, head);
    const bench = new Geo();
    const benchAt = (x, z, along) => {
      const w = along ? 2 : 0.6, d = along ? 0.6 : 2;
      bench.box(x - w / 2, x + w / 2, G + 0.45, G + 0.55, z - d / 2, z + d / 2, 0xa87a50, 1);
      for (const s of [-1, 1]) bench.box(x + (along ? s * 0.8 : 0) - 0.06, x + (along ? s * 0.8 : 0) + 0.06, G, G + 0.45, z + (along ? 0 : s * 0.8) - 0.06, z + (along ? 0 : s * 0.8) + 0.06, 0x2a3a4a, 1);
    };
    for (let x = -54; x <= 54; x += 12) if (Math.abs(x - 26) > 9) benchAt(x + 6, S.QUAY_Z - 1.2, true);
    benchAt(-6.5, -6.5, true); benchAt(6.5, 4.5, true); benchAt(S.KIOSK.x - 3.5, S.KIOSK.z + 4.5, true);
    add(bench, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), { cast: true });
  }

  // --- Habitants qui donnent les missions ---------------------------------------------
  const markTex = {};
  const citizens = {};
  for (const id of ['delivery', 'race', 'thief', 'posters']) {
    const g = S.GIVERS[id];
    const m = buildCitizen(g.look);
    m.position.set(g.x, g.y, g.z); m.rotation.y = g.yaw;
    sc.add(m); chars.push(m);
    citizens[id] = { m, def: g, mark: game.makeMark('!', 0xff9a2a) };
  }
  void markTex;
  // Le voleur, la Capitaine et son kart
  const thief = buildThief(); thief.visible = false; sc.add(thief); chars.push(thief); moving.push(thief);
  const thiefShadow = game.makeShadow(0.6); thiefShadow.visible = false;
  const capKart = buildKart(0xff5ab8); capKart.visible = false; sc.add(capKart); moving.push(capKart);
  const captain = buildCaptain(); captain.scale.setScalar(1.25); captain.visible = false; sc.add(captain); chars.push(captain); moving.push(captain);
  const capShadow = game.makeShadow(1.3); capShadow.visible = false;

  // Affiches
  const pTex = posterTexture();
  const posters = S.POSTERS.map(p => {
    const g = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.1, 0.1), M.mat(0x6a4a30));
    board.position.y = 2.0;
    const face = plane(pTex, 1.5, 1.9); face.position.set(0, 2.0, 0.06);
    const back = plane(pTex, 1.5, 1.9); back.position.set(0, 2.0, -0.06); back.rotation.y = Math.PI;
    for (const s of [-0.7, 0.7]) { const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 6), M.mat(0x6a4a30)); leg.position.set(s, 0.6, 0); g.add(leg); }
    g.add(board, face, back);
    g.position.set(p.x, p.y, p.z); g.rotation.y = p.rot;
    sc.add(shadowy(g));
    return { def: p, g };
  });

  // Karts
  const karts = S.KARTS.map((d, i) => {
    const m = buildKart(d.color);
    sc.add(m); moving.push(m);
    const k = { i, def: d, m, x: d.x, y: d.y, z: d.z, yaw: d.yaw, speed: 0, vy: 0, grounded: true, driver: -1, boost: 0, boostCd: 0, drift: 0, driftT: 0, hopped: false, climb: 0, spin: 0, wheelA: 0, bumpT: 0, shadow: game.makeShadow(1.3) };
    return k;
  });

  // Balises de mission (colonnes de lumière) et anneau au sol
  const beaconGeo = new THREE.CylinderGeometry(1.4, 1.4, 34, 20, 1, true);
  const ringGeo = new THREE.TorusGeometry(2.2, 0.16, 8, 36); ringGeo.rotateX(Math.PI / 2);
  const beacons = [];
  for (let i = 0; i < 8; i++) {
    const b = new THREE.Mesh(beaconGeo, beaconMaterial(0xffd23a)); b.visible = false; b.renderOrder = 3; b.userData.noOutline = true;
    const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.8, fog: false })); r.visible = false; r.userData.noOutline = true;
    sc.add(b, r); beacons.push({ b, r });
  }

  // Panneau de mission (en haut au centre)
  const hud = document.createElement('div');
  hud.className = 'adv-mission hidden';
  hud.innerHTML = '<b></b><span></span><em></em>';
  game.dom.root.querySelector('.adv-hud').appendChild(hud);
  const hudB = hud.querySelector('b'), hudS = hud.querySelector('span'), hudE = hud.querySelector('em');

  // =============================================================================
  // État et règles
  // =============================================================================
  const st = { m: null, karts, lastId: '' };
  const save = () => game.save;
  const city = () => save().city || (save().city = { posters: [], best: 0 });
  const medalOf = (id) => game.medals.find(m => m.def.id === S.MISSIONS.find(q => q.id === id).medal);
  const owned = (id) => save().medals.includes(S.MISSIONS.find(q => q.id === id).medal);
  const missionDef = (id) => S.MISSIONS.find(q => q.id === id);
  const distXZ = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  const players = () => game.players;
  const nearestDist = (x, z) => Math.min(...players().map(p => Math.hypot(p.pos.x - x, p.pos.z - z)));
  const unlocked = (id) => !missionDef(id).needs || save().medals.length >= missionDef(id).needs;
  const available = (id) => save().intro && unlocked(id) && (!owned(id) || id === 'race') && !(st.m && st.m.id === id);

  // --- Karts ------------------------------------------------------------------------
  function enterKart(P, k) {
    if (k.driver >= 0 || P.kart) return;
    k.driver = P.id; P.kart = k;
    P.attackT = 0; P.dashT = 0; P.vel.set(0, 0, 0);
    P.pos.set(k.x, k.y, k.z); P.yaw = k.yaw;
    game.sound('engine');
    if (!save().kartTip) {
      save().kartTip = 1;
      const c = game.controlsHelp();
      game.banner('En voiture !', `${c.dash} : turbo · ${c.jump} : saut (maintenu en virage : dérapage) · ${c.attack} : klaxon`, 4200);
    }
  }
  function exitKart(P) {
    const k = P.kart;
    if (!k) return;
    k.driver = -1; P.kart = null; k.speed = 0; k.drift = 0; k.boost = 0;
    const sx = Math.cos(k.yaw), sz = -Math.sin(k.yaw);
    const p = { x: k.x + sx * 1.8, z: k.z + sz * 1.8 };
    game.pushOut(p, k.y);
    P.pos.set(p.x, game.support(p.x, p.z, k.y + 0.6).y, p.z);
    P.vel.set(0, 4, 0); P.grounded = false; P.jumps = 1;
  }
  function resetKart(k) {
    k.x = k.def.x; k.y = k.def.y; k.z = k.def.z; k.yaw = k.def.yaw; k.speed = 0; k.vy = 0; k.grounded = true; k.boost = 0; k.drift = 0;
  }
  function honk(k) {
    if (game.t - (k.hornT || -9) < 0.5) return;
    k.hornT = game.t;
    game.sound('horn');
    // les chats tout près sursautent (et s'enfuient un instant)
    for (const c of game.cats) if (!c.dead && Math.hypot(c.pos.x - k.x, c.pos.z - k.z) < 6) c.stun = 1.5;
  }

  function driveKart(P, k, wx, wz, jumpHeld, pr, dt) {
    const frozen = game.dialog || game.freeze > 0;
    if (frozen) { wx = 0; wz = 0; jumpHeld = false; }
    k.boostCd = Math.max(0, k.boostCd - dt);
    k.boost = Math.max(0, k.boost - dt);
    k.spin = Math.max(0, k.spin - dt);
    k.bumpT = Math.max(0, k.bumpT - dt);
    if (!frozen) {
      if (pr.has('attack')) honk(k);
      if (pr.has('dash') && k.boostCd <= 0) { k.boost = 1.15; k.boostCd = 2.4; game.sound('boost'); }
      if (pr.has('jump') && k.grounded) { k.vy = K.HOP; k.grounded = false; k.hopped = true; game.sound('jump'); }
    }
    // direction voulue : le kart tourne vers le côté poussé par le stick
    const wl = Math.hypot(wx, wz);
    let target = 0, turn = 0, brake = false;
    if (wl > 0.15) {
      const want = Math.atan2(wx, wz);
      const d = angDiff(want, k.yaw);
      if (Math.abs(d) > 2.3) {
        if (k.speed < 3) { target = K.REV * wl; turn = clamp(angDiff(want + Math.PI, k.yaw) * 2, -1, 1); }
        else brake = true;
      } else {
        target = K.MAX * wl * (Math.abs(d) > 1.6 ? 0.45 : 1);
        turn = clamp(d * 2.2, -1, 1);
      }
    }
    const offroad = S.heightAt(k.x, k.z) < G - 0.25 && k.y < G - 0.2;
    if (offroad) target *= 0.6;
    if (k.boost > 0) target = K.BOOST;
    if (k.spin > 0) { target = 0; turn = 0; }
    // vitesse
    if (k.grounded) {
      if (brake) k.speed = Math.max(0, k.speed - K.BRAKE * dt);
      else if (wl <= 0.15 && k.boost <= 0) k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), K.COAST * dt);
      else {
        const acc = k.boost > 0 ? 45 : (target > k.speed ? (k.speed < 0 ? K.BRAKE : K.ACC) : K.BRAKE * 0.5);
        k.speed += clamp(target - k.speed, -acc * dt, acc * dt);
      }
    }
    // dérapage : on saute en tournant, on garde le saut appuyé
    if (k.drift) {
      if (!jumpHeld || k.speed < 6 || !k.grounded) {
        if (k.driftT > 0.7 && k.grounded) { k.boost = Math.max(k.boost, k.driftT > 1.5 ? 1.0 : 0.6); game.sound('boost'); }
        k.drift = 0; k.driftT = 0;
      } else {
        k.driftT += dt;
        turn = clamp(turn + k.drift * 0.55, -1.2, 1.2);
        if (Math.sign(turn) !== k.drift) turn = k.drift * 0.35;
        if (game.t % 0.05 < dt) {
          const col = k.driftT > 1.5 ? 0xffa030 : k.driftT > 0.7 ? 0x5ac8ff : 0xffffff;
          for (const s of [-1, 1]) game.spawnParticle(k.x - Math.sin(k.yaw) * 1.0 + Math.cos(k.yaw) * s * 0.8, k.y + 0.2, k.z - Math.cos(k.yaw) * 1.0 - Math.sin(k.yaw) * s * 0.8, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, col, 0.16, 0.3);
        }
      }
    }
    const grip = k.grounded ? 1 : 0.35;
    const rate = K.TURN * clamp(Math.abs(k.speed) / 6, 0.3, 1) * (k.drift ? 1.5 : 1) * grip;
    k.yaw += turn * rate * dt * (k.speed < -0.5 ? 1 : 1);
    if (k.spin > 0) k.yaw += dt * 14;

    // déplacement + collisions
    const prevY = k.y;
    const fx = Math.sin(k.yaw), fz = Math.cos(k.yaw);
    const slip = k.drift ? -k.drift * 0.25 : 0;   // le kart glisse un peu vers l'extérieur
    const nx0 = k.x + (fx + Math.cos(k.yaw) * slip) * k.speed * dt, nz0 = k.z + (fz - Math.sin(k.yaw) * slip) * k.speed * dt;
    const next = { x: nx0, z: nz0 };
    const blocked = (x, z) => S.heightAt(x, z) > k.y + 0.6;
    // on défonce les caisses en roulant vite
    if (Math.abs(k.speed) > 6) for (const cr of game.crates) if (!cr.broken && Math.hypot(cr.def.x - next.x, cr.def.z - next.z) < 1.9 && Math.abs(cr.def.y - k.y) < 1.2) game.breakCrate(cr);
    if (blocked(next.x, next.z)) { next.x = k.x; next.z = k.z; k.speed *= 0.3; }
    game.pushOut(next, k.y, K.R);
    for (const o of karts) {
      if (o === k) continue;
      const dx = next.x - o.x, dz = next.z - o.z, d = Math.hypot(dx, dz);
      if (d < K.R * 2 && d > 1e-4 && Math.abs(o.y - k.y) < 1.2) { next.x = o.x + dx / d * K.R * 2; next.z = o.z + dz / d * K.R * 2; if (o.driver < 0) { o.x -= dx / d * 0.05; o.z -= dz / d * 0.05; } }
    }
    const cx = next.x - nx0, cz = next.z - nz0, corr = Math.hypot(cx, cz);
    if (corr > 0.01) {
      const head = -(cx * fx + cz * fz) / corr * Math.sign(k.speed || 1);   // 1 : choc de face
      if (head > 0.35) {
        if (Math.abs(k.speed) > 9 && k.bumpT <= 0) { game.sound('bump'); game.burst(next.x + fx, k.y + 0.6, next.z + fz, 8, 0xffffff, 3, 0.35); k.bumpT = 0.4; }
        k.speed *= Math.max(0.2, 1 - head * 0.9);
      } else k.speed *= 0.985;
    }
    k.x = next.x; k.z = next.z;
    // vertical : rampes, sauts, chutes
    if (k.grounded) {
      const sup = game.support(k.x, k.z, k.y + 0.05);
      if (sup.y >= k.y - 0.5) {
        k.climb = k.climb * 0.5 + ((sup.y - prevY) / dt) * 0.5;
        k.y = sup.y;
        if (sup.collider && sup.collider.bounce) { k.vy = sup.collider.bounce * 0.75; k.grounded = false; sup.collider.squashT = game.t; game.sound('boing'); }
      } else {
        k.grounded = false;
        k.vy = k.climb > 1 ? Math.min(8, k.climb * 0.9 + 1) : 0;      // décollage au bout d'une rampe
      }
    }
    if (!k.grounded) {
      k.vy -= K.GRAV * dt;
      k.y += k.vy * dt;
      const sup = game.support(k.x, k.z, Math.max(prevY, k.y));
      if (k.y <= sup.y && k.vy <= 0) {
        if (k.vy < -12) { game.burst(k.x, sup.y + 0.1, k.z, 10, 0xf0e0c0, 3, 0.4); game.sound('bump'); }
        k.y = sup.y; k.vy = 0; k.grounded = true; k.climb = 0;
        if (k.hopped && jumpHeld && Math.abs(turn) > 0.25 && k.speed > 8) { k.drift = Math.sign(turn); k.driftT = 0; }
        k.hopped = false;
      }
    }
    // Plouf !
    if (k.y < S.WATER_Y - 0.9) {
      game.burst(k.x, S.WATER_Y + 0.2, k.z, 20, 0x9ae0ff, 4, 0.6);
      game.sound('splash');
      resetKart(k);
      game.banner('Plouf !', 'Le kart revient au parking.', 1500);
    }
    // turbo : flammes
    if (k.boost > 0 && game.t % 0.04 < dt) game.spawnParticle(k.x - fx * 1.5, k.y + 0.55, k.z - fz * 1.5, -fx * 3, 1, -fz * 3, 0x6ad0ff, 0.25, 0.25, 0);
    // le chien suit son kart
    P.pos.set(k.x, k.y, k.z);
    P.vel.set(fx * k.speed, k.vy, fz * k.speed);
    P.yaw = k.yaw; P.grounded = k.grounded; P.gliding = false;
    P.attackT = 0; P.dashT = 0;
    if (k.grounded && k.y > 0.4 && game.t - P.lastSafeT > 0.4) { P.lastSafe.set(k.x, k.y, k.z); P.lastSafeT = game.t; }
  }

  // --- Missions ---------------------------------------------------------------------
  function start(id) {
    const m = { id, ph: 'run', t: -1 };
    if (id === 'delivery') { m.t = S.DELIVERY.time; m.done = []; }
    if (id === 'race') { m.ph = 'ready'; m.t = S.RACE.time; m.prog = {}; m.cd = 0; }
    if (id === 'thief') { const r0 = S.THIEF.route[0]; m.th = { x: r0.x, y: G, z: r0.z, yaw: Math.PI, seg: 1, anim: 0 }; }
    if (id === 'boss') {
      m.ph = 'gang';
      for (const c of game.cats) if (c.def.group === 'gang') { c.dead = false; c.mesh.visible = true; c.pos.set(c.def.x, G, c.def.z); c.home.copy(c.pos); c.stun = 1; game.burst(c.pos.x, c.pos.y + 0.6, c.pos.z, 8, 0xd8d8e8, 2.5, 0.4); }
    }
    st.m = m;
    game.sound('reveal');
    game.banner(missionDef(id).title, objective(), 2600);
    game.updateHud();
  }
  function stop() { st.m = null; game.updateHud(); }
  function success(id, sub) {
    const md = medalOf(id);
    stop();
    if (md && !md.taken) game.takeMedal(md);
    else { game.sound('win'); game.banner('Mission réussie !', sub || '', 2600); }
  }
  function fail(why) {
    const id = st.m.id;
    stop();
    game.sound('poof');
    game.banner('Mission ratée…', `${why} Retourne voir ${S.GIVERS[id].short} pour réessayer.`, 3400);
  }
  function objective() {
    const m = st.m;
    if (!m) return '';
    if (m.id === 'delivery') return `Colis ${m.done.length}/${S.DELIVERY.drops.length} · ${S.DELIVERY.drops.filter(d => !m.done.includes(d.id)).map(d => d.short).join(', ')}`;
    if (m.id === 'race') return m.ph === 'ready' ? 'En kart, va sur la ligne de départ' : m.ph === 'count' ? 'Attention au départ…' : 'Passe toutes les balises dans l\'ordre !';
    if (m.id === 'thief') return 'Rattrape Filou avant son bateau !';
    if (m.id === 'posters') return `Affiches arrachées : ${city().posters.length}/${S.POSTERS.length}`;
    if (m.id === 'boss') return m.ph === 'gang' ? `Chasse le gang du quai (${gangLeft()} chats)` : `Fonce dans le kart de la Capitaine ! (${m.bs ? m.bs.hp : S.BOSS.hp} coups)`;
    return '';
  }
  const gangLeft = () => game.cats.filter(c => c.def.group === 'gang' && !c.dead).length;

  function stepMission(dt) {
    const m = st.m;
    if (!m) return;
    if (m.t > 0 && (m.id !== 'race' || m.ph === 'run')) {
      m.t -= dt;
      if (m.t <= 0) { fail(m.id === 'delivery' ? 'Trop tard, les croissants sont froids !' : 'Le temps est écoulé !'); return; }
    }
    if (m.id === 'delivery') {
      for (const d of S.DELIVERY.drops) {
        if (m.done.includes(d.id)) continue;
        const who = players().find(p => distXZ(p.pos, d.x, d.z) < 3 && Math.abs(p.pos.y - G) < 2.5);
        if (!who) continue;
        m.done.push(d.id);
        game.sound('cp'); game.burst(d.x, G + 1.5, d.z, 18, 0xffe070, 4, 0.6);
        if (m.done.length >= S.DELIVERY.drops.length) { success('delivery', 'Tous les colis sont livrés !'); return; }
        game.banner(`Colis livré à ${d.label} !`, `${m.done.length}/${S.DELIVERY.drops.length}${game.party.size > 1 ? ' · par ' + who.name : ''}`, 1800);
      }
    } else if (m.id === 'race') {
      const R = S.RACE;
      if (m.ph === 'ready') {
        if (players().some(p => p.kart && distXZ(p.pos, R.start.x, R.start.z) < R.r + 1.5)) { m.ph = 'count'; m.cd = 3.2; m.shown = 4; }
      } else if (m.ph === 'count') {
        m.cd -= dt;
        const n = Math.ceil(m.cd);
        if (n < m.shown && n > 0) { m.shown = n; game.banner(String(n), 'Prêts ?', 800); game.sound('cp'); }
        if (m.cd <= 0) { m.ph = 'run'; m.prog = {}; game.banner('PARTEZ !', `Un tour de la ville en moins de ${R.time} secondes`, 1400); game.sound('reveal'); }
      } else {
        for (const p of players()) {
          const i = m.prog[p.id] || 0;
          const cp = R.cps[i];
          if (distXZ(p.pos, cp.x, cp.z) < R.r) {
            m.prog[p.id] = i + 1;
            game.sound('cp');
            if (i + 1 >= R.cps.length) {
              const time = R.time - m.t;
              const c = city(), rec = !c.best || time < c.best;
              if (rec) c.best = Math.round(time * 10) / 10;
              game.persist();
              const who = game.party.size > 1 ? `${p.name} gagne la course !` : 'Arrivée !';
              success('race', `${who} ${fmtTime(time)}${rec ? ' · nouveau record !' : ''}`);
              if (game.party.size > 1 || owned('race')) game.banner(who, `Temps : ${time.toFixed(1)} s${rec ? ' · nouveau record !' : ''}`, 3000);
              return;
            }
          }
        }
      }
    } else if (m.id === 'thief') {
      const th = m.th, route = S.THIEF.route;
      th.anim += dt;
      if (th.stun > 0) { th.stun -= dt; return; }
      const tgt = route[th.seg];
      const dx = tgt.x - th.x, dz = tgt.z - th.z, d = Math.hypot(dx, dz);
      const near = nearestDist(th.x, th.z);
      const spd = near < 26 ? S.THIEF.speed : 6.5;      // il ralentit si on le perd de vue
      if (d < spd * dt + 0.1) {
        th.seg++;
        if (th.seg >= route.length) { fail('Filou s\'est enfui en bateau !'); return; }
      } else { th.x += dx / d * spd * dt; th.z += dz / d * spd * dt; th.yaw = lerpAngle(th.yaw, Math.atan2(dx, dz), Math.min(1, dt * 10)); }
      th.y = game.support(th.x, th.z, G + 0.5).y;
      for (const p of players()) {
        const pd = distXZ(p.pos, th.x, th.z), dy = p.pos.y - th.y;
        const hit = p.kart ? (Math.abs(p.kart.speed) > 4 && pd < 2.4) : ((pd < 1.9 && (p.attackT > 0 || p.dashT > 0) && Math.abs(dy) < 1.6) || (pd < 1.4 && p.vel.y < -1 && dy > 0.4));
        if (hit) {
          game.burst(th.x, th.y + 0.8, th.z, 24, 0xffffff, 4, 0.6);
          game.sound('meow'); game.sound('poof');
          game.say([
            { who: 'Filou', text: 'Miaou ! D\'accord, d\'accord, je rends tout !' },
            { who: S.GIVERS.thief.name, text: `Beau travail, ${game.party.size > 1 ? 'l\'équipe' : 'Ainu et Matcha'} ! Direction le commissariat, Filou.` },
          ]);
          success('thief', 'Filou est attrapé !');
          return;
        }
      }
    } else if (m.id === 'boss') {
      if (m.ph === 'gang') {
        if (gangLeft() === 0) {
          const s0 = S.BOSS.start;
          m.ph = 'chase';
          m.bs = { x: s0.x, y: G, z: s0.z, yaw: s0.yaw, seg: 0, hp: S.BOSS.hp, spin: 0, speed: 0 };
          game.say([
            { who: 'Capitaine Moustache', text: 'Miaou-ha-ha ! Mon gang a fui ? Pas grave : personne ne rattrape mon bolide !' },
            { who: 'Mamie Labrador', text: 'Vite, en kart ! Foncez-lui dedans trois fois !' },
          ]);
          game.updateHud();
        }
      } else if (m.ph === 'chase') {
        const b = m.bs;
        if (b.spin > 0) { b.spin -= dt; b.yaw += dt * 12; b.speed = 0; }
        else {
          const tgt = S.BOSS.route[b.seg];
          const dx = tgt.x - b.x, dz = tgt.z - b.z, d = Math.hypot(dx, dz);
          const near = nearestDist(b.x, b.z);
          const want = near > 45 ? 8 : S.BOSS.speed + (S.BOSS.hp - b.hp) * 1.5;
          b.speed += clamp(want - b.speed, -20 * dt, 10 * dt);
          if (d < 3) b.seg = (b.seg + 1) % S.BOSS.route.length;
          b.yaw = lerpAngle(b.yaw, Math.atan2(dx, dz), Math.min(1, dt * 4));
          b.x += Math.sin(b.yaw) * b.speed * dt; b.z += Math.cos(b.yaw) * b.speed * dt;
        }
        b.y = game.support(b.x, b.z, G + 0.5).y;
        for (const p of players()) {
          const pd = distXZ(p.pos, b.x, b.z);
          if (b.spin > 0) break;
          const hit = p.kart ? (Math.abs(p.kart.speed) > 5 && pd < 2.6) : (pd < 2.3 && (p.attackT > 0 || p.dashT > 0));
          if (hit) {
            b.hp--; b.spin = 1.8;
            game.sound('bossHit'); game.burst(b.x, b.y + 1.2, b.z, 22, 0xffffff, 5, 0.7);
            if (p.kart) p.kart.speed *= 0.4;
            if (b.hp <= 0) {
              m.ph = 'down'; b.spin = 99;
              game.say([
                { who: 'Capitaine Moustache', text: 'Grrr ! Mon beau bolide tout cabossé…' },
                { who: 'Capitaine Moustache', text: 'Vous avez gagné cette fois, les cabots ! Je quitte Port-Croquette !' },
                { who: 'Mamie Labrador', text: 'Bravo ! La ville est enfin tranquille !' },
              ], () => success('boss'));
            } else game.banner(b.hp === 2 ? 'Bien joué !' : 'Encore une fois !', `Il reste ${b.hp} coup${b.hp > 1 ? 's' : ''}`, 1400);
            game.updateHud();
            break;
          }
          if (!p.kart && b.speed > 6 && pd < 1.6 && Math.abs(p.pos.y - b.y) < 1.5) game.hurtPlayer({ x: b.x, z: b.z }, p);
        }
      }
    }
  }

  // affiches : on les arrache quand on veut ; le trophée vient avec la dernière
  function stepPosters() {
    const c = city();
    for (const ps of posters) {
      if (c.posters.includes(ps.def.id)) continue;
      const p = players().find(q => q.attackT > 0 && distXZ(q.pos, ps.def.x, ps.def.z) < 2.6 && Math.abs(q.pos.y - ps.def.y) < 2.2);
      if (!p) continue;
      c.posters.push(ps.def.id);
      game.persist();
      game.sound('crate');
      game.burst(ps.def.x, ps.def.y + 2, ps.def.z, 18, 0xf4e4c0, 4, 0.6);
      refreshPosters();
      const n = c.posters.length, N = S.POSTERS.length;
      if (n >= N && !owned('posters')) { if (st.m && st.m.id === 'posters') stop(); success('posters', 'La ville est toute propre !'); }
      else game.banner(`Affiche arrachée ! (${n}/${N})`, n === 1 && !(st.m && st.m.id === 'posters') ? 'Madame la Maire sera contente…' : '', 1500);
      game.updateHud();
    }
  }
  function refreshPosters() {
    const c = city();
    for (const ps of posters) ps.g.visible = !c.posters.includes(ps.def.id) && !owned('posters');
  }

  // --- Dialogues des habitants -----------------------------------------------------------
  function talkGiver(id) {
    const g = S.GIVERS[id];
    const s = save();
    const k = game.controlsHelp();
    if (!s.intro) { game.say([{ who: g.name, text: 'Bonjour ! Allez d\'abord dire bonjour à Mamie Labrador, sur la place de la Fontaine.' }]); return; }
    if (st.m && st.m.id === id) { game.say([{ who: g.name, text: objective() }]); return; }
    if (st.m) { game.say([{ who: g.name, text: `Finissez d'abord « ${missionDef(st.m.id).title} », on verra après !` }]); return; }
    if (id === 'delivery') {
      if (owned(id)) { game.say([{ who: g.name, text: 'Mes clients n\'ont jamais été livrés aussi vite ! Revenez quand vous voulez, la maison offre le croissant.' }]); return; }
      game.say([
        { who: g.name, text: 'Ah, vous tombez bien ! Mon livreur est malade et j\'ai trois commandes urgentes.' },
        { who: g.name, text: 'Un colis pour la Villa des Roses, un pour le commissariat et un pour le gardien du phare.' },
        { who: g.name, text: `Vous avez ${S.DELIVERY.time / 60 | 0} minutes, sinon tout sera froid. Prenez un kart, ça ira plus vite !` },
      ], () => start('delivery'));
    } else if (id === 'race') {
      const best = city().best;
      game.say([
        { who: g.name, text: owned(id) ? `Une revanche ? Le record est de ${best ? best.toFixed(1) + ' secondes' : '…'}.` : 'Salut ! C\'est moi qui prête les karts. Mais avant, il faut faire ses preuves !' },
        { who: g.name, text: `Le Grand Prix : un tour de la ville en moins de ${S.RACE.time} secondes. Suivez les balises lumineuses.` },
        { who: g.name, text: `Astuce : ${k.dash} pour le turbo, et sautez en tournant (${k.jump} maintenu) pour déraper. Un long dérapage donne un petit turbo !` },
      ], () => start('race'));
    } else if (id === 'thief') {
      if (owned(id)) { game.say([{ who: g.name, text: 'Filou est au frais. Port-Croquette dort sur ses deux oreilles grâce à vous !' }]); return; }
      game.say([
        { who: g.name, text: 'Alerte ! Filou, le pickpocket du gang, vient de s\'échapper avec un sac de croquettes volées !' },
        { who: g.name, text: 'Il court vite et file vers le port, où un bateau l\'attend. Rattrapez-le avant !' },
      ], () => start('thief'));
    } else if (id === 'posters') {
      if (owned(id)) { game.say([{ who: g.name, text: 'Merci encore ! Notre belle ville est toute propre.' }]); return; }
      const n = city().posters.length;
      game.say([
        { who: g.name, text: 'Quelle honte ! La Capitaine Moustache a collé ses affiches partout pendant la nuit.' },
        { who: g.name, text: `Il y en a ${S.POSTERS.length} : dans les rues, sur des toits, et même en haut du phare. Arrachez-les d'un coup de queue (${k.attack}) !` },
        ...(n ? [{ who: g.name, text: `Vous en avez déjà arraché ${n}, bravo !` }] : []),
      ], () => start('posters'));
    }
  }

  // =============================================================================
  const logic = {
    moving, chars,
    playerStep(P, wx, wz, jumpHeld, pr, dt) {
      const k = P.kart;
      if (!k) return false;
      P.invuln = Math.max(0, P.invuln - dt);
      P.cheerT = Math.max(0, P.cheerT - dt);
      P.flipT = 0;
      if (pr.has('talk') && !game.dialog && game.freeze <= 0) { pr.delete('talk'); exitKart(P); return true; }
      driveKart(P, k, wx, wz, jumpHeld, pr, dt);
      return true;
    },
    nearFor(Q) { return Q.kart ? { kind: 'lv', act: 'exit', label: 'DESCENDRE', x: Q.pos.x, z: Q.pos.z, y: Q.pos.y } : undefined; },
    extraCandidates(Q) {
      const out = [];
      for (const k of karts) if (k.driver < 0) out.push({ kind: 'lv', act: 'kart', k: k.i, label: 'MONTER', x: k.x, z: k.z, y: k.y });
      for (const id in citizens) { const g = S.GIVERS[id]; out.push({ kind: 'lv', act: 'giver', id, label: 'PARLER', x: g.x, z: g.z, y: g.y }); }
      void Q;
      return out;
    },
    interact(n, P) {
      if (n.act === 'kart') enterKart(P, karts[n.k]);
      else if (n.act === 'exit') exitKart(P);
      else if (n.act === 'giver') talkGiver(n.id);
    },
    step(dt) {
      // karts sans pilote : ils s'arrêtent doucement
      for (const k of karts) {
        if (k.driver >= 0 && !game.party.has(k.driver)) k.driver = -1;
        if (k.driver >= 0) continue;
        if (Math.abs(k.speed) > 0.01 || !k.grounded) {
          k.speed -= Math.sign(k.speed) * Math.min(Math.abs(k.speed), 20 * dt);
          k.x += Math.sin(k.yaw) * k.speed * dt; k.z += Math.cos(k.yaw) * k.speed * dt;
          const sup = game.support(k.x, k.z, k.y + 0.3);
          if (k.y > sup.y + 0.05) { k.vy -= K.GRAV * dt; k.y = Math.max(sup.y, k.y + k.vy * dt); } else { k.y = sup.y; k.vy = 0; k.grounded = true; }
        }
      }
      stepMission(dt);
      stepPosters();
    },
    questText() {
      const s = save();
      if (st.m) return missionDef(st.m.id).title;
      if (!s.intro) return 'Parle à Mamie Labrador';
      if (s.medals.length >= 5) return 'La ville est sauvée, bravo !';
      if (s.medals.length >= 4 && !owned('boss')) return 'Mamie t\'attend : la Capitaine est au port !';
      return `Aide les habitants « ! » (${s.medals.length}/5 trophées)`;
    },
    minimapMarks() {
      const out = [];
      for (const id in citizens) if (available(id) && !st.m) out.push([S.GIVERS[id].x, S.GIVERS[id].z, '#ff9a2a', 4]);
      if (available('boss') && !st.m) out.push([S.GIVERS.boss.x, S.GIVERS.boss.z, '#ff4a8a', 4.5]);
      for (const k of karts) if (k.driver < 0) out.push([k.x, k.z, hex(k.def.color), 2.2]);
      for (const [x, z, col] of targets()) out.push([x, z, col, 4]);
      return out;
    },
    reveal() { const o = {}; for (const m of S.medals) o[m.id] = false; return o; },
    applySave() { refreshPosters(); },
    respawn(P) { if (P.kart) exitKart(P); return null; },
    snapshot() {
      const r = (x) => Math.round(x * 100) / 100;
      const m = st.m;
      return {
        k: karts.map(k => [r(k.x), r(k.y), r(k.z), r(k.yaw), k.driver, r(k.speed), k.boost > 0 ? 1 : 0, k.drift ? (k.driftT > 1.5 ? 3 : k.driftT > 0.7 ? 2 : 1) * k.drift : 0]),
        m: m ? {
          id: m.id, ph: m.ph, t: r(m.t), done: m.done, prog: m.prog,
          th: m.th ? [r(m.th.x), r(m.th.y), r(m.th.z), r(m.th.yaw), r(m.th.anim)] : null,
          bs: m.bs ? [r(m.bs.x), r(m.bs.y), r(m.bs.z), r(m.bs.yaw), m.bs.hp, r(m.bs.spin), r(m.bs.speed)] : null,
        } : 0,
      };
    },
    apply(x) {
      x.k.forEach((d, i) => {
        const k = karts[i];
        if (!k) return;
        k.x = d[0]; k.y = d[1]; k.z = d[2]; k.yaw = d[3]; k.driver = d[4]; k.speed = d[5]; k.boost = d[6] ? 1 : 0;
        k.drift = Math.sign(d[7]); k.driftT = Math.abs(d[7]) === 3 ? 2 : Math.abs(d[7]) === 2 ? 1 : 0;
      });
      for (const P of game.players) P.kart = null;
      for (const k of karts) if (k.driver >= 0 && game.party.has(k.driver)) game.party.get(k.driver).kart = k;
      const m = x.m;
      const prevId = st.m ? st.m.id + st.m.ph : '';
      if (!m) st.m = null;
      else {
        st.m = { id: m.id, ph: m.ph, t: m.t, done: m.done || [], prog: m.prog || {} };
        if (m.th) st.m.th = { x: m.th[0], y: m.th[1], z: m.th[2], yaw: m.th[3], anim: m.th[4] };
        if (m.bs) st.m.bs = { x: m.bs[0], y: m.bs[1], z: m.bs[2], yaw: m.bs[3], hp: m.bs[4], spin: m.bs[5], speed: m.bs[6] };
      }
      if ((st.m ? st.m.id + st.m.ph : '') !== prevId) game.updateHud();
    },
    talkMamie(first) {
      const s = save();
      const k = game.controlsHelp();
      if (first || !s.intro) {
        game.say([
          { who: 'Mamie Labrador', text: 'Bienvenue à Port-Croquette, mes toutous ! Ma ville natale… enfin, quand tout va bien.' },
          { who: 'Mamie Labrador', text: 'Depuis que la Capitaine Moustache et son gang sont arrivés au port, c\'est la pagaille.' },
          { who: 'Mamie Labrador', text: 'Les habitants qui ont besoin d\'un coup de patte ont un « ! » au-dessus de la tête. Regardez aussi la carte.' },
          { who: 'Mamie Labrador', text: 'Des karts sont garés en ville : approchez-vous et montez dedans !' },
          { who: 'Mamie Labrador', text: `En kart : ${k.dash} turbo, ${k.jump} saut, ${k.jump} maintenu en virage pour déraper, ${k.attack} klaxon.` },
          { who: 'Matcha', text: 'Un kart ? C\'est moi qui conduis !' },
          { who: 'Ainu', text: 'Ouaf ! Dans tes rêves, Matcha.' },
          { who: 'Mamie Labrador', text: 'Rendez quatre services, et on ira ensemble déloger la Capitaine. Il y a aussi 100 pièces d\'or cachées un peu partout, même sur les toits !' },
        ], () => { s.intro = true; game.persist(); game.banner(S.NAME, 'Aidez les habitants : cherchez les « ! »', 2800); game.updateHud(); });
        return;
      }
      if (owned('boss')) { game.say([{ who: 'Mamie Labrador', text: 'Port-Croquette est sauvée ! Profitez-en pour faire un tour en kart… et finir de ramasser les pièces.' }]); return; }
      if (st.m && st.m.id === 'boss') { game.say([{ who: 'Mamie Labrador', text: objective() }]); return; }
      if (unlocked('boss')) {
        if (st.m) { game.say([{ who: 'Mamie Labrador', text: `Finissez d'abord « ${missionDef(st.m.id).title} », et revenez me voir !` }]); return; }
        game.say([
          { who: 'Mamie Labrador', text: 'Quatre trophées ! Toute la ville parle de vous.' },
          { who: 'Mamie Labrador', text: 'La Capitaine Moustache et son gang sont sur le quai, près de la jetée. C\'est le moment !' },
          { who: 'Ainu', text: 'Ouaf ! Allons-y !' },
        ], () => start('boss'));
        return;
      }
      const left = S.MISSIONS.filter(q => q.id !== 'boss' && !owned(q.id)).map(q => q.id);
      const hints = {
        delivery: 'Bruno le boulanger, au sud-est près du port, a des livraisons urgentes.',
        race: 'Rita, au garage du sud-ouest, organise une course de karts.',
        thief: 'Le commissaire Pataud, à l\'ouest, a besoin de renfort.',
        posters: 'Madame la Maire, devant l\'hôtel de ville au nord, est furieuse contre la Capitaine.',
      };
      game.say([{ who: 'Mamie Labrador', text: `Vous avez ${s.medals.length} trophée${s.medals.length > 1 ? 's' : ''}. Encore ${4 - s.medals.length} et on s'occupe de la Capitaine !` }, ...left.slice(0, 2).map(id => ({ who: 'Mamie Labrador', text: hints[id] }))]);
    },
    endLines() {
      return [
        { who: 'Mamie Labrador', text: 'Les 5 trophées de Port-Croquette ! La Capitaine Moustache a pris la mer pour de bon.' },
        { who: 'Matcha', text: 'Et la prochaine fois, c\'est moi qui conduis.' },
        { who: 'Ainu', text: 'Ouaf ! On verra ça !' },
        { who: 'Mamie Labrador', text: 'La ville est à vous : courses, toits, pièces d\'or… Amusez-vous bien !' },
      ];
    },
    render(dt, t) {
      // karts
      for (const k of karts) {
        const P = k.driver >= 0 ? game.party.get(k.driver) : null;
        if (P && P.kart !== k) P.kart = k;
        const x = P ? P.pos.x : k.x, y = P ? P.pos.y : k.y, z = P ? P.pos.z : k.z, yaw = P ? P.yaw : k.yaw;
        const u = k.m.userData;
        k.m.position.set(x, y, z);
        k.m.rotation.y = yaw;
        k.wheelA += k.speed * dt / 0.36;
        u.wheels.forEach((w, i) => { w.rotation.x = k.wheelA; if (i < 2) w.rotation.y = 0; });
        u.body.rotation.z = k.drift ? -k.drift * 0.12 : 0;
        u.body.rotation.x = !k.grounded ? -0.08 : 0;
        u.body.position.y = k.speed > 1 ? Math.sin(t * 30) * 0.015 : 0;
        u.flame.material.opacity = k.boost > 0 ? 0.9 : 0;
        u.flame.material.color.set(k.drift && k.driftT > 1.5 ? 0xffa030 : 0x6ad0ff);
        game.placeShadow(k.shadow, k.m.position, 1.3);
        if (P && P.mesh) {
          // le chien assis au volant
          const back = P.mesh.userData.ainu ? -0.45 : -0.3;
          P.mesh.position.set(x + Math.sin(yaw) * back, y + 0.55, z + Math.cos(yaw) * back);
          P.mesh.rotation.y = yaw;
          const pu = P.mesh.userData;
          if (pu.legs) pu.legs.forEach((l) => { l.rotation.x = 0; });
          if (pu.ainu) { pu.ainu.position.y = 0; pu.ainu.rotation.x = 0; }
          if (pu.matcha && !pu.ainu) { pu.matcha.position.y = pu.matchaY0; pu.matcha.rotation.x = 0; }
          if (P.shadow) P.shadow.visible = false;
        }
      }
      // boutons tactiles : en kart, « Charge » devient « Turbo » et « Attaque » devient « Klaxon »
      const me = game.me;
      if (!!me.kart !== st.btnKart) {
        st.btnKart = !!me.kart;
        const lab = (b, t) => { const e = game.dom.root.querySelector(`.adv-btn.${b} span`); if (e) e.textContent = t; };
        lab('dash', me.kart ? 'Turbo' : 'Charge'); lab('attack', me.kart ? 'Klaxon' : 'Attaque');
      }
      // habitants : la tête suit le joueur proche, la queue remue
      for (const id in citizens) {
        const c = citizens[id], u = c.m.userData, g = c.def;
        const d = Math.hypot(me.pos.x - g.x, me.pos.z - g.z);
        const look = d < 8 ? Math.atan2(me.pos.x - g.x, me.pos.z - g.z) : g.yaw;
        c.m.rotation.y = lerpAngle(c.m.rotation.y, look, Math.min(1, dt * 3));
        if (u.mtail) u.mtail.rotation.y = Math.sin(t * 7 + g.x) * 0.5;
        u.mhead.rotation.x = Math.sin(t * 2 + g.z) * 0.06;
        u.matcha.position.y = u.matchaY0 + Math.abs(Math.sin(t * 2.4 + g.x)) * 0.03;
        c.mark.visible = available(id) && !st.m;
        c.mark.position.set(g.x, g.y + (u.height || 1.6) + 1.3 + Math.sin(t * 4) * 0.1, g.z);
      }
      // Mamie : « ! » quand le combat final est prêt
      if (game.marks && game.marks.mamie && save().intro) game.marks.mamie.visible = (available('boss') && !st.m) || game.marks.mamie.visible;
      // voleur
      const m = st.m;
      const th = m && m.id === 'thief' ? m.th : null;
      thief.visible = !!th; thiefShadow.visible = !!th;
      if (th) {
        thief.position.set(th.x, th.y + Math.abs(Math.sin(th.anim * 9)) * 0.25, th.z);
        thief.rotation.y = th.yaw;
        thief.userData.legs.forEach((l, i) => { l.rotation.x = Math.sin(th.anim * 18 + (i % 3 ? Math.PI : 0)) * 0.9; });
        thief.userData.tail.rotation.x = -0.6;
        game.placeShadow(thiefShadow, thief.position, 0.6);
      }
      // la Capitaine en kart
      const bs = m && m.id === 'boss' ? m.bs : null;
      capKart.visible = captain.visible = capShadow.visible = !!bs;
      if (bs) {
        capKart.position.set(bs.x, bs.y, bs.z); capKart.rotation.y = bs.yaw;
        capKart.userData.wheels.forEach(w => { w.rotation.x += bs.speed * dt / 0.36; });
        captain.position.set(bs.x - Math.sin(bs.yaw) * 0.35, bs.y + 0.5, bs.z - Math.cos(bs.yaw) * 0.35);
        captain.rotation.y = bs.yaw;
        const cu = captain.userData;
        cu.stars.visible = bs.spin > 0;
        if (bs.spin > 0) cu.stars.children.forEach((s, i) => { const a = t * 4 + i * Math.PI / 2; s.position.set(Math.cos(a) * 0.45, Math.sin(t * 6 + i) * 0.05, Math.sin(a) * 0.45); });
        cu.tail.rotation.x = -0.3 + Math.sin(t * 5) * 0.3;
        cu.legs.forEach(l => { l.rotation.x = 0; });
        game.placeShadow(capShadow, capKart.position, 1.3);
      }
      // balises
      const tg = targets();
      beacons.forEach((b, i) => {
        const g = tg[i];
        b.b.visible = b.r.visible = !!g;
        if (!g) return;
        const [x, z, col, y] = g;
        b.b.material.color.set(col); b.r.material.color.set(col);
        b.b.position.set(x, (y || G) + 17, z);
        b.r.position.set(x, (y || G) + 0.3 + Math.sin(t * 3 + i) * 0.15, z);
        b.r.rotation.y = t;
        b.b.material.opacity = 0.32 + Math.sin(t * 3) * 0.1;
      });
      // panneau de mission
      hud.classList.toggle('hidden', !m);
      if (m) {
        hudB.textContent = missionDef(m.id).title;
        hudS.textContent = objective();
        const showT = m.t > 0 && (m.id !== 'race' || m.ph === 'run');
        hudE.textContent = showT ? fmtTime(m.t) : '';
        hudE.classList.toggle('urgent', showT && m.t < 15);
      }
      // décor animé
      statue.rotation.y = t * 0.8;
      fountainWater.position.y = S.FOUNTAIN.top - 0.2 + Math.sin(t * 2) * 0.02;
      if (Math.random() < dt * 25) {
        const a = Math.random() * Math.PI * 2;
        game.spawnParticle(S.FOUNTAIN.x + Math.cos(a) * 0.4, S.FOUNTAIN.colTop - 1.2, S.FOUNTAIN.z + Math.sin(a) * 0.4, Math.cos(a) * 1.8, 2.5, Math.sin(a) * 1.8, 0xd8f4ff, 0.2, 0.7, 8);
      }
      for (const b of boats) { b.m.position.y = Math.sin(t * 1.1 + b.ph) * 0.12; b.m.rotation.z = Math.sin(t * 0.9 + b.ph) * 0.04; }
      beam.material.opacity = 0.55 + Math.sin(t * 2) * 0.25;
      if (hands) { hands[0].rotation.z = -t * 0.05; hands[1].rotation.z = -t * 0.6; }
      for (const a of awn) {
        const since = t - (a.def.col.squashT || -9);
        const k = since < 0.4 ? 1 - Math.sin(since / 0.4 * Math.PI) * 0.5 * (1 - since / 0.4) : 1;
        a.g.scale.set(1, k, 1);
      }
      for (const mu of mushrooms) {
        const since = t - (mu.def.col.squashT || -9);
        const k = since < 0.5 ? 1 - Math.sin(since / 0.5 * Math.PI) * 0.3 * (1 - since / 0.5) : 1;
        mu.cap.scale.set(2 - k, 0.6 * k, 2 - k);
      }
    },
  };

  /** Points à atteindre pour la mission en cours : [x, z, couleur, y]. */
  function targets() {
    const m = st.m;
    if (!m) return [];
    if (m.id === 'delivery') return S.DELIVERY.drops.filter(d => !m.done.includes(d.id)).map(d => [d.x, d.z, '#ffd23a']);
    if (m.id === 'race') {
      if (m.ph !== 'run') return [[S.RACE.start.x, S.RACE.start.z, '#ffffff']];
      const i = (m.prog || {})[game.me.id] || 0;
      const out = [];
      if (S.RACE.cps[i]) out.push([S.RACE.cps[i].x, S.RACE.cps[i].z, '#3ae0ff']);
      if (S.RACE.cps[i + 1]) out.push([S.RACE.cps[i + 1].x, S.RACE.cps[i + 1].z, '#2a7a9a']);
      return out;
    }
    if (m.id === 'thief' && m.th) return [[m.th.x, m.th.z, '#ff4a4a', m.th.y]];
    if (m.id === 'posters') return posters.filter(p => p.g.visible).map(p => [p.def.x, p.def.z, '#ff9a2a', p.def.y]);
    if (m.id === 'boss') return m.bs ? [[m.bs.x, m.bs.z, '#ff4a8a', m.bs.y]] : [[0, 38.5, '#ff4a8a']];
    return [];
  }

  // karts garés + affiches d'après la sauvegarde
  for (const k of karts) resetKart(k);
  refreshPosters();
  return logic;
}
