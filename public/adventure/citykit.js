/*
 * Matcha & Ainu — Port-Croquette : la boîte à outils de la ville
 * (géométrie fusionnée, textures peintes, karts, voitures, habitants, chapeaux).
 */
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
export { buildCaptain } from './forest.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerpAngle = (a, b, t) => { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * t; };
export const angDiff = (a, b) => ((a - b + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
export const hex = (c) => '#' + c.toString(16).padStart(6, '0');
export const fmtTime = (s) => { s = Math.max(0, s); const m = Math.floor(s / 60), r = Math.floor(s % 60); return `${m}:${String(r).padStart(2, '0')}`; };

// Kart
export const K = { MAX: 18, BOOST: 27, ACC: 15, BRAKE: 34, COAST: 7, REV: -7, TURN: 2.5, R: 1.05, HOP: 7.5, GRAV: 32 };

/** Pièce d'or (remplace l'os du niveau 1). */
export function coinGeometry() {
  const g = new THREE.CylinderGeometry(0.34, 0.34, 0.08, 22);
  g.rotateX(Math.PI / 2);
  return g;
}

// ---------------------------------------------------------------------------
// Géométrie maison : quadrilatères avec UV et couleurs (tout est fusionné)
// ---------------------------------------------------------------------------
export class Geo {
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
export function canvasTex(w, h, draw, repeat) {
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
export function speckle(x, w, h, n, cols) { for (let i = 0; i < n; i++) { x.fillStyle = cols[i % cols.length]; x.fillRect(rnd() * w, rnd() * h, 2, 2); } }

export const roadTex = () => canvasTex(64, 128, (x, w, h) => {
  x.fillStyle = '#5a5e68'; x.fillRect(0, 0, w, h);
  speckle(x, w, h, 500, ['#4e525c', '#666a74', '#53575f']);
  x.fillStyle = '#e8e8e0'; x.fillRect(2, 0, 2, h); x.fillRect(w - 4, 0, 2, h);
  x.fillStyle = '#f2d24a'; x.fillRect(w / 2 - 1.5, 0, 3, h * 0.55);
});
export const asphaltTex = () => canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#5a5e68'; x.fillRect(0, 0, w, h); speckle(x, w, h, 300, ['#4e525c', '#666a74']); });
export const tileTex = (base, line) => canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = base; x.fillRect(0, 0, w, h);
  speckle(x, w, h, 400, ['rgba(0,0,0,0.05)', 'rgba(255,255,255,0.08)']);
  x.strokeStyle = line; x.lineWidth = 2;
  for (let i = 0; i <= 4; i++) { x.beginPath(); x.moveTo(i * 32, 0); x.lineTo(i * 32, h); x.stroke(); x.beginPath(); x.moveTo(0, i * 32); x.lineTo(w, i * 32); x.stroke(); }
});
export const cobbleTex = () => canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#c8a878'; x.fillRect(0, 0, w, h);
  for (let j = 0; j < 8; j++) for (let i = 0; i < 8; i++) {
    const l = 190 + Math.floor(rnd() * 40);
    x.fillStyle = `rgb(${l + 20},${l - 5},${l - 45})`;
    x.beginPath(); x.roundRect(i * 16 + (j % 2) * 8 + 1, j * 16 + 1, 14, 14, 4); x.fill();
  }
});
export const woodTex = () => canvasTex(64, 128, (x, w, h) => {
  for (let i = 0; i < 4; i++) { const l = 150 + Math.floor(rnd() * 30); x.fillStyle = `rgb(${l},${l - 40},${l - 85})`; x.fillRect(i * 16, 0, 15, h); }
  x.fillStyle = 'rgba(60,30,10,0.5)'; for (let i = 0; i < 4; i++) x.fillRect(i * 16 + 15, 0, 1, h);
  x.fillStyle = 'rgba(60,30,10,0.35)'; for (let i = 0; i < 12; i++) x.fillRect(Math.floor(rnd() * 4) * 16 + 7, rnd() * h, 2, 2);
});
export const windowsTex = () => canvasTex(128, 128, (x, w, h) => {
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
export const shopTex = () => canvasTex(128, 128, (x, w, h) => {
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
export const roofTex = () => canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); speckle(x, w, h, 600, ['rgba(0,0,0,0.12)', 'rgba(0,0,0,0.06)', 'rgba(255,255,255,0.3)']); });
export const stripeTex = (a, b, n) => canvasTex(128, 16, (x, w, h) => { for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? b : a; x.fillRect(i * w / n, 0, w / n + 1, h); } });

export function textTexture(lines, opts) {
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
export function plane(tex, w, h, opts) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial(Object.assign({ map: tex, roughness: 0.7, transparent: true, alphaTest: 0.05 }, opts || {})));
  m.userData.noOutline = true;
  return m;
}

/** Affiche « Vive la Capitaine Moustache ! » à arracher. */
export function posterTexture() {
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
let kartMat = null, kartWheel = null;
export function buildKart(color) {
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });   // à lui : on peut le repeindre
  if (!kartMat) kartMat = colorMat(0.4, 0.45);
  // carrosserie peinte : nez profilé, pontons latéraux, capot moteur (profils extrudés, bords arrondis)
  const P = [];
  P.push({ geo: sideBody([[0.5, 0.28], [1.95, 0.28], [2.05, 0.42], [1.9, 0.62], [1.1, 0.78], [0.5, 0.74]], 1.0, 0.1) });            // nez
  for (const sx of [-1, 1]) P.push({ geo: sideBody([[-0.95, 0.24], [0.75, 0.24], [0.85, 0.36], [0.7, 0.62], [-0.85, 0.62], [-1.0, 0.45]], 0.32, 0.08), x: sx * 0.66 });   // pontons
  P.push({ geo: sideBody([[-1.45, 0.4], [-0.75, 0.4], [-0.72, 0.95], [-1.05, 1.02], [-1.45, 0.86]], 0.9, 0.1) });                   // capot moteur
  P.push({ geo: new THREE.BoxGeometry(1.75, 0.06, 0.42), y: 1.32, z: -1.3 });                                                     // aileron
  const pm = new THREE.Mesh(M.mergeGeos(P), paint); pm.castShadow = true; pm.receiveShadow = true; body.add(pm);
  // châssis tubulaire, siège baquet, volant, moteur, échappements, numéro
  const D = [];
  const tube = (a, b, r, col) => { r = r || 0.04; const va = new THREE.Vector3(...a), vb = new THREE.Vector3(...b); const l = va.distanceTo(vb); const c = new THREE.CylinderGeometry(r, r, l, 8); const m = new THREE.Matrix4().lookAt(va, vb, new THREE.Vector3(0, 1, 0)); c.rotateX(Math.PI / 2); c.applyMatrix4(new THREE.Matrix4().extractRotation(m)); c.translate((va.x + vb.x) / 2, (va.y + vb.y) / 2, (va.z + vb.z) / 2); D.push({ geo: c, color: col || 0x2a2c32 }); };
  for (const sx of [-1, 1]) { tube([sx * 0.55, 0.3, 1.7], [sx * 0.55, 0.3, -1.3]); tube([sx * 0.55, 0.3, -1.3], [sx * 0.75, 0.32, -1.65]); }
  tube([-0.75, 0.32, -1.65], [0.75, 0.32, -1.65], 0.05, 0x8a8e96);                     // pare-chocs arrière
  tube([-0.55, 0.3, 1.2], [0.55, 0.3, 1.2]); tube([-0.55, 0.3, -0.9], [0.55, 0.3, -0.9]);
  const seat = new THREE.CylinderGeometry(0.42, 0.36, 0.7, 16, 1, true, Math.PI * 0.6, Math.PI * 1.8); D.push({ geo: seat, color: 0x1a1a1e, y: 0.72, z: -0.42 });
  D.push({ geo: new THREE.BoxGeometry(0.7, 0.1, 0.62), color: 0x1a1a1e, y: 0.42, z: -0.32 });
  const wheel = new THREE.TorusGeometry(0.19, 0.035, 8, 22); wheel.rotateX(-0.6); D.push({ geo: wheel, color: 0x18181c, y: 0.98, z: 0.5 });
  tube([0, 0.62, 0.95], [0, 0.95, 0.55], 0.03);
  D.push({ geo: new THREE.BoxGeometry(0.5, 0.36, 0.42), color: 0x5a5e66, y: 0.62, z: -1.15 });                                 // moteur
  for (const sx of [-0.25, 0.25]) { const ex = new THREE.CylinderGeometry(0.06, 0.08, 0.5, 12); ex.rotateX(Math.PI / 2 - 0.25); D.push({ geo: ex, color: 0xd8dce4, x: sx, y: 0.72, z: -1.55 }); }
  for (const sx of [-0.55, 0.55]) D.push({ geo: new THREE.BoxGeometry(0.06, 0.48, 0.1), color: 0x2a2c32, x: sx, y: 1.08, z: -1.3 });
  D.push({ geo: new THREE.CylinderGeometry(0.2, 0.2, 0.03, 18), color: 0xf4f4f0, y: 0.58, z: 1.75, rx: -1.2 });                // plaque numéro
  for (const sx of [-0.32, 0.32]) { const hl = new THREE.SphereGeometry(0.09, 12, 8); hl.scale(1.2, 0.8, 0.6); D.push({ geo: hl, color: 0xfffbe8, x: sx, y: 0.5, z: 2.0 }); }
  const dm = new THREE.Mesh(mergeColored(D), kartMat); dm.castShadow = true; body.add(dm);
  // roues : gros pneus slicks, jantes chromées
  const wheels = [];
  if (!kartWheel) kartWheel = wheelGeo(0.34, 0.36);
  for (const [x, z] of [[-0.9, 1.25], [0.9, 1.25], [-0.95, -1.15], [0.95, -1.15]]) {
    const w = new THREE.Group(); w.position.set(x, 0.34, z);
    const t = new THREE.Mesh(kartWheel, kartMat); t.castShadow = true; w.add(t);
    g.add(w); wheels.push(w);
  }
  // flammes du turbo
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0x6ad0ff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.scale.set(1.2, 1.2, 1); flame.position.set(0, 0.72, -1.9); g.add(flame);
  g.userData = { body, wheels, flame, paint };
  return g;
}

export function hat(kind) {
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
  } else if (kind === 'lady') {
    const straw = M.mat(0xf0d890, { roughness: 0.8 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20), straw); brim.position.y = 0.22;
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.18, 16), straw); top.position.y = 0.31;
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), M.mat(0xff6aa0)); flower.position.set(0.18, 0.3, 0.06);
    g.add(brim, top, flower);
  } else if (kind === 'sailor' || kind === 'driver') {
    const w = M.mat(kind === 'sailor' ? 0xffffff : 0x3a3a48, { roughness: 0.6 }), k = M.mat(0x1a2a4a, { roughness: 0.5 });
    const top = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.23, 0.14, 20), w); top.position.y = 0.3;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.235, 0.235, 0.06, 20), k); band.position.y = 0.22;
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.025, 16, 1, false, -Math.PI / 2, Math.PI), k); visor.position.set(0, 0.2, 0.1); visor.scale.set(1, 1, 1.3);
    g.add(top, band, visor);
    if (kind === 'sailor') { const anchor = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.015, 6, 12), M.GOLD()); anchor.position.set(0, 0.3, 0.26); g.add(anchor); }
  } else if (kind === 'clown') {
    const a = M.mat(0xe03a3a, { roughness: 0.5 }), b = M.mat(0xffd040, { roughness: 0.5 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.36, 16), a); crown.position.y = 0.4;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.03, 18), b); brim.position.y = 0.23;
    const pom = new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), b); pom.position.y = 0.62;
    g.add(crown, brim, pom);
  } else if (kind === 'director') {
    const c = canvasTex(64, 64, (x) => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); } });
    const m = new THREE.MeshStandardMaterial({ map: c, roughness: 0.6 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m); dome.position.y = 0.18;
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), M.mat(0x111111)); visor.position.set(0, 0.19, 0.12); visor.scale.set(1, 1, 1.25);
    g.add(dome, visor);
  } else if (kind === 'pirate') {
    const k = M.mat(0x1a1a22, { roughness: 0.6 });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), k); crown.position.y = 0.2; crown.scale.set(1.2, 0.9, 1);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 3), k); brim.rotation.x = Math.PI / 2; brim.position.y = 0.22;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.mat(0xffffff)); skull.position.set(0, 0.32, 0.24);
    g.add(crown, brim, skull);
  } else if (kind === 'astro') {
    const m = M.mat(0x3a3a8a, { roughness: 0.6 });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 16), m); cone.position.y = 0.48;
    for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.OctahedronGeometry(0.04), M.mat(0xffe040, { emissive: 0xffc000, emissiveIntensity: 0.6 })); st.position.set(Math.cos(i * 1.6) * 0.12, 0.35 + i * 0.07, Math.sin(i * 1.6) * 0.12 + 0.05); g.add(st); }
    g.add(cone);
  } else if (kind === 'seller') {
    const b = M.mat(0xff6ab0);
    for (const sx of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.14, 10), b); c.rotation.z = sx * Math.PI / 2; c.position.set(sx * 0.08, 0.3, 0.02); g.add(c); }
  } else if (kind === 'mayor') {
    const k = M.mat(0x1a1a22, { roughness: 0.5 });
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.3, 16), k); crown.position.y = 0.38;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.03, 18), k); brim.position.y = 0.23;
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.06, 16), M.mat(0x8a3ad0)); ribbon.position.y = 0.27;
    g.add(crown, brim, ribbon);
  }
  return g;
}

export function buildCitizen(look) {
  let m;
  if (look === 'baker') m = M.buildPug({ fur: 0xd8b088, mask: 0x5a3a28, belly: 0xf0dcc0, collar: 0xffffff, scale: 1.55 });
  else if (look === 'mechanic') m = M.buildYorkie({ bow: null, steel: 0x6a6070, tan: 0xd0a070, scale: 1.65 });
  else if (look === 'police') m = M.buildPug({ fur: 0x50505c, mask: 0x18181e, belly: 0x6a6a76, collar: 0x2a4ab0, scale: 1.6 });
  else if (look === 'lady') m = M.buildYorkie({ bow: null, steel: 0xf2ece4, tan: 0xfaf4ee, scale: 1.5 });
  else if (look === 'sailor') m = M.buildPug({ fur: 0xc8a070, mask: 0x3a2a20, belly: 0xe8d4b0, collar: 0x2a4ab0, scale: 1.7 });
  else if (look === 'clown') m = M.buildYorkie({ bow: null, steel: 0x8a5a3a, tan: 0xe0a060, scale: 1.5 });
  else if (look === 'director') m = M.buildPug({ fur: 0xe8e0d0, mask: 0x4a3a30, belly: 0xffffff, collar: 0xe03a3a, scale: 1.6 });
  else if (look === 'pirate') m = M.buildPug({ fur: 0x9a9088, mask: 0x3a3430, belly: 0xc8c0b8, collar: 0x8a2a2a, scale: 1.6 });
  else if (look === 'astro') m = M.buildYorkie({ bow: null, steel: 0x6a6a7a, tan: 0xc8b090, scale: 1.5 });
  else if (look === 'driver') m = M.buildPug({ fur: 0xb08860, mask: 0x2a2018, belly: 0xe0c8a0, collar: 0xf0c020, scale: 1.55 });
  else if (look === 'seller') m = M.buildYorkie({ bow: null, steel: 0x8a6a5a, tan: 0xf0c8a0, scale: 1.45 });
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

export function buildThief() {
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

export function buildBoat(color) {
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

export function beaconMaterial(color) {
  const t = canvasTex(4, 128, (x) => {
    const g = x.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(0.6, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = g; x.fillRect(0, 0, 4, 128);
  }, false);
  return new THREE.MeshBasicMaterial({ color, map: t, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false });
}

// ===========================================================================

// ---------------------------------------------------------------------------
// Textures en plus pour la grande ville
// ---------------------------------------------------------------------------
export const glassTex = () => canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  const g = x.createLinearGradient(0, 0, w, h); g.addColorStop(0, '#4a7aa8'); g.addColorStop(1, '#2a4a70');
  x.fillStyle = g; x.fillRect(8, 8, 52, 108); x.fillRect(68, 8, 52, 108);
  x.fillStyle = 'rgba(255,255,255,0.28)'; x.beginPath(); x.moveTo(12, 100); x.lineTo(40, 12); x.lineTo(52, 12); x.lineTo(24, 100); x.fill();
  x.beginPath(); x.moveTo(72, 100); x.lineTo(100, 12); x.lineTo(112, 12); x.lineTo(84, 100); x.fill();
});
export const metalTex = () => canvasTex(64, 64, (x, w, h) => {
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) { x.fillStyle = 'rgba(0,0,0,0.13)'; x.fillRect(i * 8, 0, 3, h); x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(i * 8 + 4, 0, 2, h); }
});
export const checkerTex = () => canvasTex(64, 16, (x) => { for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); } });
export const sandTex = () => canvasTex(64, 64, (x, w, h) => { x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h); speckle(x, w, h, 500, ['rgba(120,90,40,0.15)', 'rgba(255,255,255,0.4)']); });

/** Fusionne des pièces colorées en un seul maillage (couleurs par sommet). */
export function mergeColored(list) {
  const geos = list.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return g;
  });
  return M.mergeGeos(list.map((p, i) => Object.assign({}, p, { geo: geos[i] })));
}
const colorMat = (rough, metal) => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: rough, metalness: metal || 0 });
let carMat = null, walkerMat = null;

// ---------------------------------------------------------------------------
// Voitures de la circulation
// ---------------------------------------------------------------------------
/** Normales lissées entre faces voisines peu inclinées (les arêtes vives restent vives). */
function smoothNormals(g, maxDeg) {
  const geo = g.index ? g.toNonIndexed() : g;
  const p = geo.attributes.position, n = p.count, cos = Math.cos((maxDeg || 50) * Math.PI / 180);
  const fn = new Float32Array(n * 3), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2);
    const f = b.sub(a).cross(c.sub(a)).normalize();
    for (let k = 0; k < 3; k++) { fn[(i + k) * 3] = f.x; fn[(i + k) * 3 + 1] = f.y; fn[(i + k) * 3 + 2] = f.z; }
  }
  const map = new Map(), key = (i) => `${Math.round(p.getX(i) * 1e3)},${Math.round(p.getY(i) * 1e3)},${Math.round(p.getZ(i) * 1e3)}`;
  for (let i = 0; i < n; i++) { const k = key(i); if (!map.has(k)) map.set(k, []); map.get(k).push(i); }
  const out = new Float32Array(n * 3);
  for (const list of map.values()) for (const i of list) {
    let x = 0, y = 0, z = 0;
    for (const j of list) { const d = fn[i * 3] * fn[j * 3] + fn[i * 3 + 1] * fn[j * 3 + 1] + fn[i * 3 + 2] * fn[j * 3 + 2]; if (d >= cos) { x += fn[j * 3]; y += fn[j * 3 + 1]; z += fn[j * 3 + 2]; } }
    const l = Math.hypot(x, y, z) || 1; out[i * 3] = x / l; out[i * 3 + 1] = y / l; out[i * 3 + 2] = z / l;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}
// Carrosserie : profil de côté (z, y) extrudé sur la largeur, bords arrondis
function sideBody(pts, width, bevel) {
  const sh = new THREE.Shape();
  pts.forEach(([z, y], i) => (i ? sh.lineTo(z, y) : sh.moveTo(z, y)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 4, curveSegments: 6 });
  g.translate(0, 0, -(width - bevel * 2) / 2);
  g.rotateY(-Math.PI / 2);          // profil : z devient l'avant, l'extrusion devient la largeur (x)
  return smoothNormals(g, 48);
}
const carPaints = new Map();
let carGlass = null, carTrim = null, carRim = null;
function carPaint(color) {
  if (!carPaints.has(color)) carPaints.set(color, new THREE.MeshPhysicalMaterial({ color, roughness: 0.28, metalness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }));
  return carPaints.get(color);
}
/** Roue : pneu, flanc, jante à 5 branches (axe x). */
function wheelGeo(r, w) {
  const parts = [];
  const tyre = new THREE.CylinderGeometry(r, r, w, 22); tyre.rotateZ(Math.PI / 2);
  parts.push({ geo: tyre, color: 0x1c1d20 });
  for (const sx of [-1, 1]) {
    const rim = new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.04, 20); rim.rotateZ(Math.PI / 2);
    parts.push({ geo: rim, color: 0x9a9ea6, x: sx * (w / 2 + 0.005) });
    for (let k = 0; k < 5; k++) {
      const sp = new THREE.BoxGeometry(0.03, r * 0.55, r * 0.14); sp.translate(0, r * 0.27, 0); sp.rotateX(k / 5 * Math.PI * 2);
      parts.push({ geo: sp, color: 0xdfe2e8, x: sx * (w / 2 + 0.03) });
    }
    const cap = new THREE.CylinderGeometry(r * 0.14, r * 0.14, 0.05, 12); cap.rotateZ(Math.PI / 2);
    parts.push({ geo: cap, color: 0xdfe2e8, x: sx * (w / 2 + 0.04) });
  }
  return mergeColored(parts);
}
export function buildCar(color, kind) {
  const g = new THREE.Group();
  const van = kind === 'van', bus = kind === 'bus';
  if (!carGlass) {
    carGlass = new THREE.MeshStandardMaterial({ color: 0x1a2632, roughness: 0.04, metalness: 0.7 });
    carTrim = colorMat(0.35, 0.3);
    carRim = colorMat(0.3, 0.6);
  }
  const paint = carPaint(color);
  const W = bus ? 2.4 : van ? 1.95 : 1.82;
  let body, cabin, len, wheelZ, wr;
  if (bus) {
    len = 8.4; wr = 0.48; wheelZ = [2.7, -2.6];
    body = [[-4.2, 0.45], [4.2, 0.45], [4.25, 1.2], [4.2, 2.9], [4.0, 3.15], [-4.1, 3.15], [-4.25, 2.9], [-4.25, 0.6]];
    cabin = [[4.21, 1.55], [4.14, 2.85], [-4.17, 2.85], [-4.24, 1.55]];
  } else if (van) {
    len = 4.8; wr = 0.38; wheelZ = [1.55, -1.55];
    body = [[-2.4, 0.38], [2.4, 0.38], [2.45, 0.75], [2.35, 1.05], [1.75, 1.25], [1.25, 2.1], [1.0, 2.2], [-2.35, 2.2], [-2.45, 2.0], [-2.45, 0.55]];
    cabin = [[1.8, 1.25], [1.3, 2.05], [-0.1, 2.05], [-0.1, 1.28]];
  } else {
    len = 4.3; wr = 0.36; wheelZ = [1.38, -1.35];
    body = [[-2.12, 0.36], [2.12, 0.36], [2.18, 0.62], [2.1, 0.82], [1.25, 0.98], [0.95, 1.02], [-1.5, 1.02], [-2.05, 0.98], [-2.18, 0.8], [-2.18, 0.5]];
    cabin = [[0.98, 1.0], [0.25, 1.48], [-0.85, 1.46], [-1.55, 1.0]];
  }
  const add = (geo, m) => { const o = new THREE.Mesh(geo, m); o.castShadow = true; o.receiveShadow = true; g.add(o); return o; };
  add(sideBody(body, W, bus ? 0.14 : 0.12), paint);
  // vitres (teintées, brillantes) et toit peint par-dessus
  add(sideBody(cabin, W - (bus ? 0.04 : 0.16), 0.08), carGlass);
  if (!bus) {
    const roof = cabin.slice(1, 3);
    const rg = new THREE.BoxGeometry(W - 0.2, 0.06, Math.abs(roof[0][0] - roof[1][0]) + 0.1);
    const ro = add(rg, paint); ro.position.set(0, roof[0][1] + 0.04, (roof[0][0] + roof[1][0]) / 2);
    // montants
    const pz = van ? 0.55 : -0.3;
    const pil = add(new THREE.BoxGeometry(W - 0.14, (roof[0][1] - cabin[0][1]) * 0.98, 0.09), paint); pil.position.set(0, (roof[0][1] + cabin[0][1]) / 2, pz);
  } else {
    for (let z = -3.6; z <= 3.6; z += 1.2) { const pil = add(new THREE.BoxGeometry(W - 0.02, 1.25, 0.1), paint); pil.position.set(0, 2.2, z); }
  }
  // pièces fines : pare-chocs, calandre, phares, feux, rétroviseurs, plaques
  const D = [], F = len / 2;
  const box = (w, h, d, col, x, y, z) => D.push({ geo: new THREE.BoxGeometry(w, h, d), color: col, x, y, z });
  box(W + 0.04, 0.22, 0.18, 0x2a2c32, 0, 0.48, F + 0.02);
  box(W + 0.04, 0.22, 0.18, 0x2a2c32, 0, 0.48, -F - 0.04);
  box(W * 0.5, bus ? 0.4 : 0.18, 0.04, 0x15161a, 0, bus ? 0.95 : 0.68, F + 0.06);                      // calandre
  for (const sx of [-1, 1]) {
    const hl = new THREE.SphereGeometry(bus ? 0.16 : 0.13, 12, 8); hl.scale(1.3, 0.75, 0.5);
    D.push({ geo: hl, color: 0xfffbe8, x: sx * (W / 2 - 0.26), y: bus ? 0.95 : 0.7, z: F + 0.04 });
    box(bus ? 0.2 : 0.3, 0.12, 0.05, 0xd8202a, sx * (W / 2 - 0.22), bus ? 1.0 : 0.78, -F - 0.03);              // feux arrière
    if (!bus) { box(0.16, 0.1, 0.12, 0x2a2c32, sx * (W / 2 + 0.06), cabin[0][1] + 0.08, cabin[0][0] - 0.25); }  // rétros
    box(0.04, 0.03, 0.4, 0x8a8e96, sx * (W / 2 + 0.005), bus ? 1.3 : 0.75, 0.2);                                // poignées / jonc
  }
  box(0.52, 0.12, 0.02, 0xf4f4f0, 0, 0.5, F + 0.12);
  box(0.52, 0.12, 0.02, 0xf4d040, 0, 0.5, -F - 0.14);
  if (bus) box(W * 0.8, 0.3, 0.05, 0x101418, 0, 3.0, F + 0.01);                                          // girouette
  if (van) { const rw = add(new THREE.BoxGeometry(W - 0.5, 0.62, 0.03), carGlass); rw.position.set(0, 1.62, -F - 0.06); }
  add(mergeColored(D), carTrim);
  // roues
  const wg = wheelGeo(wr, bus ? 0.36 : 0.26);
  const wheels = [];
  for (const z of wheelZ) for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(wg, carRim); w.position.set(sx * (W / 2 - 0.12), wr, z); w.castShadow = true; g.add(w); wheels.push(w);
  }
  g.userData = { len, wheels };
  return g;
}

/** Petit passant (chien à poils courts, sans fourrure : léger à dessiner). */
export function buildWalker(color, cat) {
  const g = new THREE.Group();
  const LT = 0xf6eee0, BK = 0x111111, parts = [];
  const add = (geo, col, x, y, z, rx, sx, sy, sz) => parts.push({ geo, color: col, x, y, z, rx, sx, sy, sz });
  add(new THREE.CapsuleGeometry(0.22, 0.4, 3, 8), color, 0, 0.5, 0, Math.PI / 2);
  add(new THREE.SphereGeometry(0.22, 10, 8), color, 0, 0.85, 0.32);
  add(new THREE.SphereGeometry(0.11, 8, 6), LT, 0, 0.8, 0.5, 0, 1, 0.8, 1.1);
  add(new THREE.SphereGeometry(0.035, 6, 4), BK, 0, 0.83, 0.61);
  for (const sx of [-1, 1]) {
    add(new THREE.SphereGeometry(0.035, 6, 4), BK, sx * 0.08, 0.89, 0.51);
    if (cat) add(new THREE.ConeGeometry(0.07, 0.16, 6), color, sx * 0.14, 1.05, 0.3);
    else add(new THREE.SphereGeometry(0.08, 6, 5), color, sx * 0.14, 0.97, 0.3, 0, 0.6, 1.3, 0.5);
  }
  for (const [x, z] of [[-0.12, 0.18], [0.12, 0.18], [-0.12, -0.18], [0.12, -0.18]]) add(new THREE.CapsuleGeometry(0.06, 0.2, 2, 6), color, x, 0.2, z);
  add(new THREE.CapsuleGeometry(0.04, 0.25, 2, 6), color, 0, 0.62, -0.38, -0.8);
  if (!walkerMat) walkerMat = colorMat(0.8);
  const o = new THREE.Mesh(mergeColored(parts), walkerMat); o.castShadow = true; g.add(o);
  g.userData = { body: o };
  return g;
}

// ---------------------------------------------------------------------------
// Chapeaux de la boutique (portés par les chiens joueurs)
// ---------------------------------------------------------------------------
export function buildShopHat(id) {
  const g = new THREE.Group();
  if (id === 'h_cap') {
    const m = M.mat(0x3a8ae0, { roughness: 0.6 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), m);
    const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.03, 16, 1, false, -Math.PI / 2, Math.PI), m); visor.position.set(0, 0.01, 0.13); visor.scale.set(1, 1, 1.3);
    g.add(dome, visor);
  } else if (id === 'h_sun') {
    const k = M.mat(0x111118, { roughness: 0.2, metalness: 0.5 });
    for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.03, 14), k); l.rotation.x = Math.PI / 2; l.position.set(sx * 0.1, -0.2, 0.25); g.add(l); }
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.025, 0.02), k); bar.position.set(0, -0.18, 0.25); g.add(bar);
  } else if (id === 'h_cowboy') {
    const m = M.mat(0x9a6a3a, { roughness: 0.8 });
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20), m); brim.scale.set(1, 1, 0.8);
    const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.22, 0.24, 16), m); crown.position.y = 0.13;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.05, 16), M.mat(0x3a2010)); band.position.y = 0.04;
    g.add(brim, crown, band);
  } else if (id === 'h_pirate') {
    const k = M.mat(0x1a1a22, { roughness: 0.6 });
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), k); crown.scale.set(1.2, 0.9, 1);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 6, 3), k); brim.rotation.x = Math.PI / 2; brim.position.y = 0.02;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.mat(0xffffff)); skull.position.set(0, 0.12, 0.25);
    g.add(crown, brim, skull);
  } else if (id === 'h_crown') {
    const gold = M.GOLD();
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.12, 16, 1, true), gold); ring.position.y = 0.06; ring.material = gold;
    g.add(ring);
    for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2; const p = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 6), gold); p.position.set(Math.cos(a) * 0.19, 0.18, Math.sin(a) * 0.19); g.add(p); }
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.05), M.mat(0xe0304a, { emissive: 0x801020, emissiveIntensity: 0.5 })); gem.position.set(0, 0.08, 0.21); g.add(gem);
  }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// ---------------------------------------------------------------------------
// Biplan à cockpit ouvert (les chiens s'assoient dedans). Avant = +z, roues au sol en y = 0.
// ---------------------------------------------------------------------------
/** Profil d'aile (bord d'attaque arrondi), extrudé sur l'envergure (axe x). */
function wingGeo(span, chord, thick) {
  const s = new THREE.Shape();
  const n = 14;
  for (let i = 0; i <= n; i++) {           // dessus : du bord de fuite au bord d'attaque
    const t = i / n, z = chord / 2 - t * chord;
    const y = thick * 0.5 * Math.sqrt(Math.max(0, 1 - Math.pow(2 * t - 1.25, 2) / 1.5625)) * (t > 0.95 ? 0.6 : 1);
    if (i === 0) s.moveTo(z, 0.01); else s.lineTo(z, y + 0.005);
  }
  for (let i = n; i >= 0; i--) { const t = i / n, z = chord / 2 - t * chord; s.lineTo(z, -thick * 0.18 * Math.sin(Math.PI * t)); }
  const g = new THREE.ExtrudeGeometry(s, { depth: span, bevelEnabled: true, bevelThickness: 0.05, bevelSize: 0.04, bevelSegments: 3, curveSegments: 4 });
  g.translate(0, 0, -span / 2);
  g.rotateY(Math.PI / 2);                 // profil dans le plan (z, y), envergure sur x
  g.computeVertexNormals();
  return g;
}
let planeMats = null;
export function buildPlane(color) {
  if (!planeMats) planeMats = {
    cream: new THREE.MeshStandardMaterial({ color: 0xf2ead6, roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x24262c, roughness: 0.55, metalness: 0.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xd8dce4, roughness: 0.18, metalness: 0.95 }),
    wood: new THREE.MeshStandardMaterial({ color: 0x7a4a26, roughness: 0.45 }),
    leather: new THREE.MeshStandardMaterial({ color: 0x5a3018, roughness: 0.7 }),
    glass: new THREE.MeshStandardMaterial({ color: 0xbfe0ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.45 }),
  };
  const PM = planeMats;
  const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.15, clearcoat: 1, clearcoatRoughness: 0.12 });
  const g = new THREE.Group();
  const body = new THREE.Group(); g.add(body);
  const add = (geo, m, x, y, z, rx, ry, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.rotation.set(rx || 0, ry || 0, rz || 0); o.castShadow = true; o.receiveShadow = true; body.add(o); return o; };
  // fuselage : profil tourné (capot moteur rond à l'avant, effilé vers la queue)
  const prof = [[0.02, -3.9], [0.22, -3.7], [0.42, -2.6], [0.62, -1.2], [0.74, 0.2], [0.8, 1.6], [0.8, 2.6], [0.72, 3.2], [0.6, 3.45], [0.02, 3.5]].map(([r, y]) => new THREE.Vector2(r, y));
  const fus = new THREE.LatheGeometry(prof, 28); fus.rotateX(Math.PI / 2); fus.scale(0.92, 1.08, 1);
  add(fus, paint, 0, 1.75, 0);
  // capot moteur chromé et cylindres en étoile
  add(new THREE.CylinderGeometry(0.74, 0.8, 0.5, 28, 1, true), PM.chrome, 0, 1.75, 3.25, Math.PI / 2);
  for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; add(new THREE.CylinderGeometry(0.11, 0.11, 0.42, 10), PM.dark, Math.cos(a) * 0.55, 1.75 + Math.sin(a) * 0.55, 3.35, 0, 0, a + Math.PI / 2); }
  // hélice
  const prop = new THREE.Group(); prop.position.set(0, 1.75, 3.62); body.add(prop);
  const spinner = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.6, 20), paint); spinner.rotation.x = Math.PI / 2; spinner.position.z = 0.22; prop.add(spinner);
  for (const s of [-1, 1]) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 1.3, 0.05), PM.wood); b.position.y = s * 0.7; b.rotation.y = s * 0.35; b.castShadow = true; prop.add(b);
  }
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.42, 32), new THREE.MeshBasicMaterial({ color: 0x9a8a78, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }));
  disc.position.z = 0.04; prop.add(disc);
  // ailes (deux plans), mâts et haubans
  add(wingGeo(9.6, 1.55, 0.2), PM.cream, 0, 3.15, 0.9);
  add(wingGeo(8.6, 1.45, 0.18), PM.cream, 0, 1.05, 1.0);
  for (const sx of [-1, 1]) {
    add(new THREE.BoxGeometry(0.6, 0.06, 1.42), paint, sx * 4.45, 3.27, 0.9);           // bouts d'aile peints
    for (const dz of [0.45, -0.45]) add(new THREE.CylinderGeometry(0.045, 0.045, 2.1, 8), PM.dark, sx * 3.4, 2.1, 0.95 + dz);
    add(new THREE.CylinderGeometry(0.012, 0.012, 3.0, 4), PM.chrome, sx * 2.0, 2.1, 0.95, 0, 0, sx * 0.85);
    add(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 8), PM.dark, sx * 0.45, 2.55, 1.35, 0, 0, sx * 0.25);   // cabane
    // train d'atterrissage
    add(new THREE.CylinderGeometry(0.05, 0.05, 1.25, 8), PM.dark, sx * 0.62, 0.78, 1.95, 0.35, 0, sx * 0.45);
  }
  add(new THREE.CylinderGeometry(0.05, 0.05, 2.0, 8), PM.dark, 0, 0.4, 1.95, 0, 0, Math.PI / 2);   // essieu
  const wheels = [];
  const tyre = new THREE.TorusGeometry(0.3, 0.12, 12, 24); tyre.rotateY(Math.PI / 2);
  const hub = new THREE.CylinderGeometry(0.2, 0.2, 0.2, 16); hub.rotateZ(Math.PI / 2);
  for (const sx of [-1, 1]) {
    const w = new THREE.Group(); w.position.set(sx * 1.0, 0.42, 1.95); body.add(w); wheels.push(w);
    const t = new THREE.Mesh(tyre, PM.dark), h = new THREE.Mesh(hub, PM.chrome); t.castShadow = true; w.add(t, h);
  }
  add(new THREE.CylinderGeometry(0.035, 0.035, 1.3, 6), PM.dark, 0, 0.82, -3.3, -0.35);          // roulette de queue
  add(new THREE.SphereGeometry(0.15, 10, 8), PM.dark, 0, 0.15, -3.1);
  // empennage
  add(wingGeo(3.6, 1.0, 0.1), PM.cream, 0, 1.95, -3.35);
  const fin = new THREE.Shape(); fin.moveTo(-0.9, 0); fin.lineTo(0.55, 0); fin.quadraticCurveTo(0.3, 1.2, -0.35, 1.45); fin.quadraticCurveTo(-0.85, 1.4, -0.9, 0);
  const finG = new THREE.ExtrudeGeometry(fin, { depth: 0.08, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 2 }); finG.translate(0, 0, -0.04); finG.rotateY(-Math.PI / 2);
  add(finG, paint, 0, 1.95, -3.45);
  // cockpit ouvert : rebord en cuir, pare-brise, tableau de bord
  add(new THREE.TorusGeometry(0.62, 0.08, 10, 28), PM.leather, 0, 2.5, -0.55, Math.PI / 2, 0, 0).scale.set(1, 1.6, 1);
  add(new THREE.CylinderGeometry(0.6, 0.6, 0.05, 28), PM.dark, 0, 2.3, -0.55);
  const ws = add(new THREE.CylinderGeometry(0.5, 0.5, 0.42, 20, 1, true, -0.9, 1.8), PM.glass, 0, 2.72, 0.05);
  ws.castShadow = false;
  // échappements
  for (const sx of [-1, 1]) add(new THREE.CylinderGeometry(0.06, 0.07, 1.3, 10), PM.chrome, sx * 0.72, 1.35, 2.2, Math.PI / 2 - 0.08);
  // flamme du turbo
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0xffa040, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.scale.set(1.6, 1.6, 1); flame.position.set(0, 1.75, -4.1); g.add(flame);
  g.userData = { body, prop, disc, wheels, flame, paint, seatY: 1.45, seatZ: -0.55 };
  return g;
}
