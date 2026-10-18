/*
 * Matcha & Ainu — les costumes à pouvoir : modèles, effets, boîtes à costume, interface.
 * Les règles et les réglages sont dans powerdata.js ; game.js appelle :
 *   jumpV / airJump / tryPound / move / land  (physique, chez l'hôte ou en solo)
 *   step (boîtes, chacun pour son chien) · render (tenues de tous les chiens, effets)
 *   applyNet / remoteWear (monde partagé) · wardrobeHtml (garde-robe)
 *
 * Tout ce qui se voit est rejoué sur chaque écran à partir de l'état des chiens
 * (pouvoir, fusée, plongeon) : les amis voient la cape flotter, les ressorts
 * s'écraser et le chapeau scintiller, comme chez celui qui joue.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as M from './models.js';
import * as T from './toon.js';
import * as WR from './wardrobe.js';
import { L } from './current.js';
import { KIND } from './juice.js';
import { POWERS, PHYS, POWER_IDS, powerDef, powerCode, decodePower, powerUnlocked, boxesOf, BOX_REGROW, rechargeGauge, canRocket, canPound } from './powerdata.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = (a, b, k) => a + (b - a) * k;

// ---------------------------------------------------------------------------
// Icônes (même style que celles de l'interface : dégradés, contour sombre)
// ---------------------------------------------------------------------------
const svg = (body) => 'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>
<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff9a8a"/><stop offset="1" stop-color="#d8282e"/></linearGradient>
<linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#9aa8b8"/></linearGradient>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8af0d0"/><stop offset="1" stop-color="#14a080"/></linearGradient>
<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b49aff"/><stop offset="1" stop-color="#4a2ac8"/></linearGradient>
<linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a0"/><stop offset=".5" stop-color="#ffb030"/><stop offset="1" stop-color="#ff5a20" stop-opacity="0"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3a8"/><stop offset="1" stop-color="#e89a10"/></linearGradient></defs>${body}</svg>`);
export const ICONS = {
  magnet: svg('<path d="M13 8h13v24a6 6 0 0 0 12 0V8h13v24a19 19 0 0 1-38 0z" fill="url(#r)" stroke="#6a0a10" stroke-width="3" stroke-linejoin="round"/><path d="M13 8h13v9H13zM38 8h13v9H38z" fill="url(#s)" stroke="#3a4250" stroke-width="3" stroke-linejoin="round"/><path d="M19 30a13 13 0 0 0 6 12" stroke="#fff" stroke-width="3" fill="none" opacity=".55" stroke-linecap="round"/><g stroke="#ffe066" stroke-width="3" stroke-linecap="round"><path d="M10 3l3 2M54 3l-3 2M32 2v3"/></g>'),
  boots: svg('<path d="M18 6h16v18l12 4c4 1 6 4 6 8H18z" fill="url(#t)" stroke="#0a4a3a" stroke-width="3" stroke-linejoin="round"/><path d="M18 14h16" stroke="#fff" stroke-width="3" opacity=".7"/><rect x="16" y="36" width="38" height="6" rx="3" fill="#3a3a44" stroke="#14141a" stroke-width="2.5"/><path d="M22 44l22 3-22 3 22 3-22 3 22 3" fill="none" stroke="url(#s)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/><path d="M22 44l22 3-22 3 22 3-22 3 22 3" fill="none" stroke="#4a5260" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round" opacity=".6"/>'),
  cape: svg('<path d="M22 8h20l-2 6c8 10 12 24 14 38-8-4-14-2-22 2-8-4-14-6-22-2 2-14 6-28 14-38z" fill="url(#p)" stroke="#20105a" stroke-width="3" stroke-linejoin="round"/><path d="M32 22l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z" fill="url(#g)" stroke="#8a5200" stroke-width="1.6" stroke-linejoin="round"/><circle cx="32" cy="10" r="4.5" fill="url(#g)" stroke="#8a5200" stroke-width="2"/><path d="M26 54c2 4 4 7 6 9 2-2 4-5 6-9" fill="url(#f)"/>'),
};

// ---------------------------------------------------------------------------
// Petites aides de géométrie
// ---------------------------------------------------------------------------
/** Boîte aux coins arrondis (un cube subdivisé dont les sommets sont « gonflés » vers les coins). */
function roundedBox(w, h, d, r, seg) {
  const g = new THREE.BoxGeometry(w, h, d, seg, seg, seg), p = g.attributes.position;
  const hx = w / 2 - r, hy = h / 2 - r, hz = d / 2 - r, v = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(clamp(v.x, -hx, hx), clamp(v.y, -hy, hy), clamp(v.z, -hz, hz));
    v.sub(c); if (v.lengthSq() > 1e-9) v.normalize().multiplyScalar(r);
    p.setXYZ(i, c.x + v.x, c.y + v.y, c.z + v.z);
  }
  g.computeVertexNormals();
  return g;
}
/** Fusionne des géométries (déjà placées), avec une couleur par morceau si demandé (vertexColors). */
function merge(parts, colored) {
  const geos = parts.map(([g, col]) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (!n.attributes.normal) n.computeVertexNormals();
    if (colored) {
      const c = new THREE.Color(col), a = new Float32Array(n.attributes.position.count * 3);
      for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; }
      n.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    return n;
  });
  const out = new THREE.BufferGeometry(), keys = ['position', 'normal', ...(colored ? ['color'] : []), ...(geos.every(g => g.attributes.uv) ? ['uv'] : [])];
  for (const k of keys) {
    const size = geos[0].attributes[k].itemSize, total = geos.reduce((s, g) => s + g.attributes[k].count, 0), arr = new Float32Array(total * size);
    let o = 0;
    for (const g of geos) { arr.set(g.attributes[k].array, o); o += g.attributes[k].array.length; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, size));
  }
  return out;
}
const placed = (g, x, y, z, rx, ry, rz, sx, sy, sz) => {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0)), new THREE.Vector3(sx || 1, sy || sx || 1, sz || sx || 1));
  return g.applyMatrix4(m);
};
const mesh = (geo, mat, shadow) => { const m = new THREE.Mesh(geo, mat); m.castShadow = !!shadow; m.userData.noOutline = true; return m; };

// matériaux (partagés)
let MATS = null;
function mats(lite) {
  if (MATS) return MATS;
  const cloth = (o) => (lite ? new THREE.MeshStandardMaterial(o) : new THREE.MeshPhysicalMaterial(Object.assign({ sheen: 1, sheenRoughness: 0.5, sheenColor: new THREE.Color(0xffffff) }, o)));
  MATS = {
    felt: cloth({ color: 0xe0484c, roughness: 0.92 }),
    feltBand: cloth({ color: 0xfff1d8, roughness: 0.9 }),
    red: new THREE.MeshStandardMaterial({ color: 0xe0262c, roughness: 0.38, metalness: 0.1 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe8eef4, roughness: 0.22, metalness: 0.95 }),
    bootV: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.72 }),
    springV: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.25, metalness: 0.85 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xffc440, roughness: 0.3, metalness: 0.85 }),
    rocketV: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.55 }),
    flame: new THREE.MeshBasicMaterial({ map: flameTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
    spark: new THREE.SpriteMaterial({ map: M.glowTexture(), color: 0x9ad8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }),
  };
  for (const k of ['felt', 'feltBand', 'red', 'chrome', 'gold']) MATS[k].userData.keepPBR = true;
  return MATS;
}
function flameTex() {
  const c = document.createElement('canvas'); c.width = 16; c.height = 64;
  const x = c.getContext('2d'), g = x.createLinearGradient(0, 0, 0, 64);
  g.addColorStop(0, 'rgba(255,255,230,1)'); g.addColorStop(0.25, 'rgba(255,220,90,0.95)'); g.addColorStop(0.6, 'rgba(255,120,40,0.6)'); g.addColorStop(1, 'rgba(255,60,20,0)');
  x.fillStyle = g; x.fillRect(0, 0, 16, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let capeTexC = null;
/** Le tissu de la cape : violet profond, galon doré, une étoile ; un léger grain de tissu. */
function capeTex() {
  if (capeTexC) return capeTexC;
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 256);
  g.addColorStop(0, '#6a4ae8'); g.addColorStop(0.6, '#4a2ab8'); g.addColorStop(1, '#2e1880');
  x.fillStyle = g; x.fillRect(0, 0, 128, 256);
  // grain du tissu (fines rayures croisées)
  x.globalAlpha = 0.07; x.fillStyle = '#fff';
  for (let i = 0; i < 256; i += 3) x.fillRect(0, i, 128, 1);
  for (let i = 0; i < 128; i += 3) x.fillRect(i, 0, 1, 256);
  x.globalAlpha = 1;
  // galon doré sur les bords et en bas (festonné)
  x.fillStyle = '#ffc848';
  x.fillRect(0, 0, 7, 256); x.fillRect(121, 0, 7, 256);
  x.beginPath(); x.moveTo(0, 240);
  for (let i = 0; i <= 8; i++) x.quadraticCurveTo(i * 16 - 8, 256, i * 16, 240);
  x.lineTo(128, 256); x.lineTo(0, 256); x.fill();
  x.fillStyle = '#fff2b0'; x.fillRect(2, 0, 2, 256); x.fillRect(124, 0, 2, 256);
  // l'étoile (dessinée tête en bas : le haut de la cape est en haut de la texture)
  x.save(); x.translate(64, 120);
  x.fillStyle = '#ffd04a'; x.strokeStyle = '#a86a10'; x.lineWidth = 3; x.beginPath();
  for (let i = 0; i < 10; i++) { const a = i / 10 * TAU - Math.PI / 2, d = i % 2 ? 13 : 30; x.lineTo(Math.cos(a) * d, Math.sin(a) * d); }
  x.closePath(); x.fill(); x.stroke();
  x.fillStyle = 'rgba(255,255,255,0.6)'; x.beginPath(); x.arc(-6, -8, 5, 0, TAU); x.fill();
  x.restore();
  capeTexC = new THREE.CanvasTexture(c); capeTexC.colorSpace = THREE.SRGBColorSpace; capeTexC.anisotropy = 4;
  return capeTexC;
}
/** Papier cadeau des boîtes : la couleur du pouvoir, de petites étoiles et des pois. */
function boxTex(col) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'), base = new THREE.Color(col), hi = base.clone().lerp(new THREE.Color(0xffffff), 0.45);
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, '#' + hi.getHexString()); g.addColorStop(1, '#' + base.getHexString());
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
    const cx = i * 32 + (j % 2) * 16 + 8, cy = j * 32 + 10;
    if ((i + j) % 2) { x.beginPath(); x.arc(cx, cy, 4, 0, TAU); x.fill(); }
    else { x.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU, d = k % 2 ? 2.4 : 6.5; x.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d); } x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
/** Image d'une icône SVG dans un rond blanc (bulle au-dessus de la boîte). */
function iconSprite(id) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const draw = (img) => {
    x.clearRect(0, 0, 128, 128);
    x.shadowColor = 'rgba(0,0,0,0.35)'; x.shadowBlur = 8; x.shadowOffsetY = 3;
    x.fillStyle = '#fff'; x.beginPath(); x.arc(64, 62, 52, 0, TAU); x.fill();
    x.shadowColor = 'transparent';
    x.fillStyle = powerDef(id).color; x.beginPath(); x.arc(64, 62, 46, 0, TAU); x.fill();
    x.fillStyle = 'rgba(255,255,255,0.92)'; x.beginPath(); x.arc(64, 62, 40, 0, TAU); x.fill();
    if (img) x.drawImage(img, 30, 28, 68, 68);
    t.needsUpdate = true;
  };
  draw(null);
  if (typeof Image !== 'undefined') { const im = new Image(); im.onload = () => draw(im); im.src = ICONS[id]; }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true }));
  s.scale.set(0.95, 0.95, 1); s.renderOrder = 6;
  return s;
}

// ---------------------------------------------------------------------------
// Les tenues (construites une fois par chien et par pouvoir)
// ---------------------------------------------------------------------------
/** Chapeau-aimant : un bob en feutre rouge, un ruban crème et un gros aimant en fer à cheval. */
function buildHat(lite) {
  const m = mats(lite), g = new THREE.Group();
  const dome = placed(new THREE.SphereGeometry(0.2, 22, 12, 0, TAU, 0, Math.PI / 2), 0, 0.02, 0, 0, 0, 0, 1, 0.78, 1);
  const brim = placed(new THREE.CylinderGeometry(0.27, 0.29, 0.03, 28), 0, 0.02, 0);
  const felt = mesh(merge([[dome], [brim]]), m.felt, true); g.add(felt);
  const band = mesh(new THREE.TorusGeometry(0.198, 0.022, 8, 28), m.feltBand); band.rotation.x = Math.PI / 2; band.position.y = 0.05; g.add(band);
  // l'aimant (il se balance un peu sur son ressort de chapeau)
  const mag = new THREE.Group(); mag.position.y = 0.17; g.add(mag);
  const arc = placed(new THREE.TorusGeometry(0.075, 0.03, 10, 18, Math.PI), 0, 0.02, 0, 0, 0, Math.PI);
  const legs = [-1, 1].map(s => placed(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 12), s * 0.075, 0.065, 0));
  mag.add(mesh(merge([[arc], ...legs.map(l => [l])]), m.red, true));
  const tips = [-1, 1].map(s => placed(new THREE.CylinderGeometry(0.032, 0.032, 0.05, 12), s * 0.075, 0.13, 0));
  mag.add(mesh(merge(tips.map(t => [t])), m.chrome));
  const spark = new THREE.Sprite(m.spark.clone()); spark.position.y = 0.16; spark.scale.setScalar(0.16); spark.renderOrder = 6; mag.add(spark);
  g.userData = { mag, spark };
  return g;
}
/** Une botte-ressort : botte en feutre (bout rond, revers blanc), semelle, ressort chromé et patin. */
function buildBoot(lite) {
  const m = mats(lite), g = new THREE.Group();
  const TEAL = 0x22b496, DARK = 0x2a2a34, CREAM = 0xfff4e0;
  const shaft = placed(new THREE.CylinderGeometry(0.115, 0.125, 0.17, 16), 0, 0.125, 0);
  const cuff = placed(new THREE.TorusGeometry(0.118, 0.032, 8, 18), 0, 0.21, 0, Math.PI / 2);
  const toe = placed(new THREE.SphereGeometry(0.13, 16, 10), 0, 0.075, 0.07, 0, 0, 0, 1, 0.62, 1.2);
  const sole = placed(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 18), 0, 0.02, 0.04, 0, 0, 0, 1, 1, 1.25);
  const boot = mesh(merge([[shaft, TEAL], [toe, TEAL], [cuff, CREAM], [sole, DARK]], true), m.bootV, true);
  g.add(boot);
  // le ressort : une hélice (tube) + un patin, pivot en haut (sous la semelle) pour s'écraser
  const spring = new THREE.Group(); g.add(spring);
  const H = 0.17, turns = 3.5;
  class Helix extends THREE.Curve { getPoint(t, o) { const a = t * turns * TAU; return (o || new THREE.Vector3()).set(Math.cos(a) * 0.075, -t * H, Math.sin(a) * 0.075 + 0.03); } }
  const coil = new THREE.TubeGeometry(new Helix(), lite ? 40 : 64, 0.016, lite ? 5 : 7, false);
  const pad = placed(new THREE.CylinderGeometry(0.1, 0.11, 0.035, 16), 0, -H - 0.015, 0.03);
  spring.add(mesh(merge([[coil, 0xdfe6ee], [pad, 0x3a3a44]], true), m.springV));
  g.userData = { spring, H };
  return g;
}
/** Cape-fusée : un tissu animé (7 × 10 sommets), un fermoir doré et deux petits réacteurs. */
function buildCape(lite, W, Hh) {
  const m = mats(lite), g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(1, 1, 6, 9);
  const cmat = lite ? new THREE.MeshStandardMaterial({ map: capeTex(), roughness: 0.85, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({ map: capeTex(), roughness: 0.8, side: THREE.DoubleSide, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color(0xd8c8ff) });
  cmat.userData.keepPBR = true;
  const cloth = mesh(geo, cmat, true); cloth.frustumCulled = false; g.add(cloth);
  const clasp = mesh(new THREE.TorusGeometry(0.05, 0.016, 8, 16), m.gold); clasp.position.set(0, 0.0, 0.03); g.add(clasp);
  // deux petits réacteurs dorés et rouges sur les épaules (on les voit sortir de la cape)
  const RED = 0xe0402a, GOLD = 0xffc440;
  const parts = [];
  for (const s of [-1, 1]) {
    parts.push([placed(new THREE.CylinderGeometry(0.045, 0.05, 0.16, 12), s * 0.13, -0.02, -0.05, Math.PI / 2 - 0.35), RED]);
    parts.push([placed(new THREE.SphereGeometry(0.046, 12, 8), s * 0.13, 0.008, 0.024, 0, 0, 0, 1, 1, 0.8), RED]);
    parts.push([placed(new THREE.CylinderGeometry(0.055, 0.04, 0.05, 12), s * 0.13, -0.047, -0.13, Math.PI / 2 - 0.35), GOLD]);
  }
  const rockets = mesh(merge(parts, true), m.rocketV, true); g.add(rockets);
  const fl = [-1, 1].map(s => placed(new THREE.ConeGeometry(0.05, 0.42, 10, 1, true), s * 0.13, -0.13, -0.33, -Math.PI / 2 - 0.35 + Math.PI));
  const flame = mesh(merge(fl.map(f => [f])), m.flame); flame.visible = false; flame.renderOrder = 6; g.add(flame);
  g.userData = { cloth, geo, W, H: Hh, flame, rockets };
  return g;
}

// où accrocher la cape (repère du corps qui la porte) : pivot, largeur, longueur, échelle des réacteurs
const CAPE_AT = {
  matcha: { p: [0, 0.165, 0.12], W: 0.36, H: 0.76, back: 0.5, k: 0.85 },  // Matcha tout seul (corps ×1,3)
  ainu: { p: [0, 1.74, 0.42], W: 1.15, H: 1.9, back: 0.66, k: 1.6 },      // Ainu tout seul
};

// ---------------------------------------------------------------------------
export class Powers {
  constructor(game) {
    this.g = game;
    this.lite = !!game.lite;
    const o = WR.outfit();
    this.mine = o.power && powerUnlocked(o.power, o.found, WR.rewards()) ? o.power : null;
    this.boxes = boxesOf(L.ID).map((def) => this.makeBox(def));
    this.buildHud();
    this.v = new THREE.Vector3(); this.v2 = new THREE.Vector3();
  }

  // ----------------------------------------------------------------- boîtes à costume
  makeBox(def) {
    const g = this.g, p = powerDef(def.power), m = mats(this.lite);
    const root = new THREE.Group();
    const s = g.support(def.x, def.z, def.y + 0.8);
    root.position.set(def.x, s.y, def.z);
    const box = new THREE.Group(); root.add(box);
    const bodyMat = new THREE.MeshStandardMaterial({ map: boxTex(p.color), roughness: 0.62 });
    bodyMat.userData.keepPBR = true;
    const body = mesh(roundedBox(1.0, 0.9, 1.0, 0.16, 5), bodyMat, !this.lite); body.receiveShadow = true; box.add(body);
    // ruban doré en croix + gros nœud sur le dessus
    const rib = [
      [placed(roundedBox(1.04, 0.94, 0.2, 0.08, 3), 0, 0, 0)],
      [placed(roundedBox(0.2, 0.94, 1.04, 0.08, 3), 0, 0, 0)],
      [placed(new THREE.SphereGeometry(0.15, 14, 10), -0.15, 0.53, 0, 0, 0, 0.55, 1.25, 0.72, 0.55)],
      [placed(new THREE.SphereGeometry(0.15, 14, 10), 0.15, 0.53, 0, 0, 0, -0.55, 1.25, 0.72, 0.55)],
      [placed(new THREE.SphereGeometry(0.075, 10, 8), 0, 0.5, 0)],
    ];
    box.add(mesh(merge(rib), m.gold, !this.lite));
    const icon = iconSprite(def.power); icon.position.y = 1.65; root.add(icon);
    // halo doux au sol
    const halo = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), new THREE.MeshBasicMaterial({ map: M.glowTexture(), color: new THREE.Color(p.color), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
    halo.rotation.x = -Math.PI / 2; halo.position.y = 0.06; halo.renderOrder = 2; halo.userData.noOutline = true; root.add(halo);
    if (!g.realistic) { T.toonify(box); T.outlineTree(box, 0.02, 0x2a1c14); }
    g.scene.add(root);
    return { def, root, box, icon, halo, y0: s.y, state: 'ready', t: Math.random() * 6, open: 0, wig: 0, wigV: 0, near: false };
  }
  /** Chacun ouvre les boîtes pour son propre chien (l'hôte n'a rien à arbitrer : la boîte repousse). */
  step(dt) {
    const g = this.g, me = g.me;
    if (me && me.power !== this.mine) me.power = this.mine;
    for (const b of this.boxes) {
      b.t += dt;
      if (b.state === 'open') { b.open += dt; if (b.open > BOX_REGROW) { b.state = 'grow'; b.open = 0; g.burst(b.root.position.x, b.y0 + 0.9, b.root.position.z, 10, 0xfff0b0, 2.5, 0.5); } continue; }
      if (b.state === 'grow') { b.open += dt; if (b.open > 0.6) { b.state = 'ready'; b.open = 0; } }
      if (!me || me.down || g.dialog) continue;
      const p = b.root.position, d = Math.hypot(me.pos.x - p.x, me.pos.z - p.z), dy = me.pos.y - b.y0;
      b.near = d < 6;
      if (d < 1.45 && dy > -1.2 && dy < 2.2 && b.state === 'ready') {
        if (me.power === b.def.power) { if (b.t - (b.bumpT || -9) > 1.2) { b.bumpT = b.t; b.wigV += 9; g.sound('pop'); } continue; }
        this.openBox(b, me);
        this.wear(me, b.def.power, true);
      }
    }
  }
  openBox(b, P) {
    const g = this.g, p = b.root.position;
    b.state = 'open'; b.open = 0;
    g.juice.confetti(p.x, b.y0 + 1.1, p.z, 34, 0.8);
    g.juice.sparkle(p.x, b.y0 + 0.8, p.z, 14, 0xfff0a0, 1);
    g.juice.hitStars(p.x, b.y0 + 0.8, p.z, 6, new THREE.Color(powerDef(b.def.power).color).getHex());
    g.burst(p.x, b.y0 + 0.6, p.z, 16, 0xffffff, 3.5, 0.6);
    // l'icône s'envole vers le chien
    b.fly = { t: 0, P };
  }

  /** Mettre un pouvoir (ou l'enlever : id = null). fromBox : trouvé dans une boîte. */
  wear(P, id, fromBox) {
    if (id && !POWER_IDS.includes(id)) return;
    const g = this.g;
    if (P !== g.me) { P.power = id; return; }
    const o = WR.outfit(), fresh = id && !(o.found || []).includes(id);
    o.found = Array.from(new Set([...(o.found || []), ...(id ? [id] : [])]));
    o.power = id || null;
    WR.setOutfit(o);
    if (g.outfit) { g.outfit.power = o.power; g.outfit.found = o.found; }
    this.mine = P.power = id || null;
    P.rocketG = 1; P.rocketT = 0; P.pound = null;
    const def = powerDef(id);
    if (def) g.banner(fresh ? '✨ Nouveau pouvoir : ' + def.name + ' !' : def.name + ' !', def.hint, fresh ? 3600 : 2400);
    else g.banner('Sans pouvoir', 'Les costumes à pouvoir sont dans la garde-robe 🎩', 1600);
    this.hudShow(true);
    this.sing(id ? 'wear' : 'off');
    if (fromBox) g.haptic(P, [10, 40, 14], 0);
  }
  /** Le pouvoir d'un chien en petit nombre (état du monde partagé). */
  code(P) { return powerCode(P); }
  /** Hôte : le pouvoir porté par un ami (il l'envoie avec ses commandes). */
  remoteWear(P, id) {
    if (!P || P === this.g.me) return;
    P.power = POWER_IDS.includes(id) ? id : null;
  }
  /** Ami : le pouvoir (et la fusée, le plongeon) des autres chiens, reçus de l'hôte. */
  applyNet(P, code) {
    if (!P || P === this.g.me || code === undefined) return;
    const d = decodePower(code);
    P.power = d.power; P.rocketT = d.rocket ? Math.max(P.rocketT || 0, 0.05) : 0; P.pound = d.pound ? (P.pound || { t: 1 }) : null;
  }

  // ----------------------------------------------------------------- physique (hôte / solo)
  /** Vitesse du saut depuis le sol. */
  jumpV(P, v) { return P.power === 'boots' ? PHYS.BOOT_JUMP_V : v; }
  /** Appui sur Saut en l'air quand le double saut est déjà fait : la fusée. */
  airJump(P) {
    if (!canRocket(P)) return false;
    P.rocketT = PHYS.ROCKET_T; P.rocketG = 0; P.gliding = false;
    return true;
  }
  /** Appui sur Attaque en l'air avec les bottes : le plongeon. */
  tryPound(P) {
    if (!canPound(P)) return false;
    P.pound = { t: 0 }; P.rocketT = 0; P.dashT = 0; P.attackT = 0;
    P.vel.set(0, 0, 0);
    return true;
  }
  /** Après la gravité et le planeur, avant le déplacement : fusée, plongeon, cape qui plane. */
  move(P, dt, input) {
    P.rocketG = rechargeGauge(P.rocketG, dt, P.grounded);
    if (P.power !== 'cape') P.rocketT = 0;
    if (P.power !== 'boots') P.pound = null;
    if (P.pound) {
      P.pound.t += dt; P.gliding = false; P.vel.x = 0; P.vel.z = 0;
      P.vel.y = P.pound.t < PHYS.POUND_HANG ? 0.5 : -PHYS.POUND_FALL;
      return;
    }
    if (P.rocketT > 0) {
      P.rocketT -= dt; P.gliding = false;
      const k = clamp(P.rocketT / PHYS.ROCKET_T, 0, 1);
      P.vel.y = PHYS.ROCKET_UP * (0.55 + 0.45 * k);
      const f = PHYS.ROCKET_FWD * (0.7 + 0.3 * k);
      P.vel.x = ease(P.vel.x, Math.sin(P.yaw) * f, 0.35); P.vel.z = ease(P.vel.z, Math.cos(P.yaw) * f, 0.35);
      return;
    }
    if (P.gliding && P.power === 'cape') {
      // la cape porte bien : on file plus vite vers l'avant
      let wx = input.wx, wz = input.wz;
      if (wx === undefined) [wx, wz] = this.g.worldMove(input.x || 0, input.y || 0);
      const wl = Math.hypot(wx, wz);
      if (wl > 0.1) {
        const tgt = 8.5 * PHYS.CAPE_SPEED * Math.min(1, wl), tx = wx / wl * tgt, tz = wz / wl * tgt;
        const dvx = tx - P.vel.x, dvz = tz - P.vel.z, dl = Math.hypot(dvx, dvz), acc = 30 * dt;
        if (dl > acc) { P.vel.x += dvx / dl * acc; P.vel.z += dvz / dl * acc; } else { P.vel.x = tx; P.vel.z = tz; }
      }
    }
  }
  /** Après le déplacement vertical : l'atterrissage du plongeon (onde de choc + gros rebond). */
  land(P, wasGrounded) {
    if (!P.pound || wasGrounded || !P.grounded) return;
    const g = this.g;
    P.pound = null;
    P.vel.y = PHYS.POUND_BOUNCE; P.grounded = false; P.jumps = 1; P.coyote = 0; P.onCol = null;
    P.poundAt = g.t;
    // les chats tout autour s'envolent, les caisses cassent
    for (const c of g.cats) if (!c.dead && Math.hypot(c.pos.x - P.pos.x, c.pos.z - P.pos.z) < PHYS.POUND_R && Math.abs(c.pos.y - P.pos.y) < 2) g.defeatCat(c);
    for (const cr of g.crates) if (!cr.broken && Math.hypot(cr.def.x - P.pos.x, cr.def.z - P.pos.z) < 2.6 && Math.abs(cr.def.y - P.pos.y) < 1.6) g.breakCrate(cr);
  }

  // ----------------------------------------------------------------- tenues et effets (chaque écran)
  render(dt, t) {
    const g = this.g;
    for (const P of g.players) if (P.mesh) this.renderDog(P, dt, t);
    this.renderBoxes(dt, t);
    this.updateHud(dt);
  }
  renderBoxes(dt, t) {
    const g = this.g;
    for (const b of this.boxes) {
      const { root, box, icon } = b;
      const h = b.wig; b.wigV += (-b.wig * 140 - b.wigV * 9) * Math.min(dt, 1 / 30); b.wig += b.wigV * Math.min(dt, 1 / 30);
      const exc = b.near ? 1 : 0;
      let sc = 1;
      if (b.state === 'open') sc = Math.max(0, 1 - b.open * 5) * (1 + Math.sin(Math.min(1, b.open * 5) * Math.PI) * 0.5);
      else if (b.state === 'grow') { const k = clamp(b.open / 0.6, 0, 1); sc = k < 1 ? Math.sin(k * Math.PI * 0.5) * (1 + Math.sin(k * Math.PI) * 0.25) : 1; }
      box.visible = sc > 0.01;
      box.position.y = 0.75 + Math.sin(b.t * 2.2) * 0.12 + Math.abs(Math.sin(b.t * 9)) * 0.08 * exc;
      box.rotation.y = b.t * 0.7 + Math.sin(b.t * 7) * 0.12 * exc;
      box.rotation.z = h * 0.25 + Math.sin(b.t * 11) * 0.05 * exc;
      box.scale.set(sc * (1 - h * 0.2), sc * (1 + h * 0.3), sc * (1 - h * 0.2));
      icon.visible = b.state !== 'open' || !!b.fly;
      icon.position.y = 1.75 + Math.sin(b.t * 2.2 + 0.6) * 0.1;
      icon.material.opacity = b.state === 'grow' ? clamp(b.open / 0.6, 0, 1) : 1;
      icon.scale.setScalar(0.95 * (1 + exc * 0.1 * Math.sin(b.t * 6)));
      b.halo.material.opacity = (0.4 + Math.sin(b.t * 3) * 0.12) * (box.visible ? 1 : 0.3);
      if (b.fly) {
        // l'icône file vers le chien qui a ouvert la boîte, puis éclate en étoiles
        const f = b.fly; f.t += dt;
        const k = clamp(f.t / 0.45, 0, 1), P = f.P;
        icon.position.set(ease(0, P.pos.x - root.position.x, k * k), ease(1.75, P.pos.y - root.position.y + 1.6, k) + Math.sin(k * Math.PI) * 1.2, ease(0, P.pos.z - root.position.z, k * k));
        icon.scale.setScalar(0.95 * (1 - k * 0.6));
        if (k >= 1) { b.fly = null; icon.position.set(0, 1.75, 0); icon.scale.setScalar(0.95); }
      }
      if (box.visible && b.near && Math.random() < dt * 6) {
        const a = Math.random() * TAU;
        g.spawnParticle(root.position.x + Math.cos(a) * 0.7, root.position.y + 0.4 + Math.random() * 0.8, root.position.z + Math.sin(a) * 0.7, 0, 0.8, 0, 0xfff2b0, 0.16, 0.7, -0.3, KIND.spark);
      }
    }
  }

  /** Construit / met à jour la tenue d'un chien (n'importe lequel : le mien ou ceux des amis). */
  renderDog(P, dt, t) {
    const g = this.g, id = P.power || null;
    let V = P.pwv;
    const key = (id || '') + '|' + P.mesh.uuid + '|' + (P.mesh.userData.matcha ? P.mesh.userData.matcha.visible : '');
    if (!V || V.key !== key) {
      const swapped = V && V.id !== id;
      if (V) this.unwear(V);
      V = P.pwv = this.dressDog(P, id);
      V.key = key;
      if (swapped) this.swapFx(P, id);
    }
    // le chapeau de la garde-robe s'efface sous le chapeau-aimant
    if (P === g.me && P.outfitMeshes) for (const m of P.outfitMeshes) if (m.userData.wrKind === 'hat') m.visible = id !== 'magnet';
    if (!id) return;
    const a = P.anim || {}, sp = Math.hypot(P.vel.x, P.vel.z);
    const near = g.camera.position.distanceToSquared(P.pos) < 45 * 45;
    // ---- effets à chaque changement d'état (rejoués sur chaque écran)
    const rocket = P.rocketT > 0, pound = !!P.pound;
    if (rocket && !V.rocket) this.rocketFx(P);
    if (V.pound && !pound) this.poundFx(P);
    if (!V.pound && pound) this.sfxAt(P, 'pound');
    if (id === 'boots' && V.grounded && !P.grounded && P.vel.y > 13) { this.sfxAt(P, 'boing'); V.stretch = 1; }
    if (id === 'boots' && !V.grounded && P.grounded && (V.vy || 0) < -7) { V.squash = 1; this.sfxAt(P, 'boingS'); }
    V.rocket = rocket; V.pound = pound; V.grounded = P.grounded; V.vy = P.vel.y;
    const ride = P.kart || P.ride || P.board || P.cannon || (P.digT > 0);
    if (id === 'magnet') {
      const u = V.hat.userData, pull = g.boneMag ? [...g.boneMag.values()].some(m => m.P === P) : false;
      V.pull = ease(V.pull || 0, pull ? 1 : 0, Math.min(1, dt * 6));
      V.wob = (V.wob || 0); V.wobV = (V.wobV || 0);
      V.wobV += (-(V.wob) * 90 - V.wobV * 6 - (a.rate || 0) * 0.6 - (a.jigV || 0) * 0.4) * Math.min(dt, 1 / 30); V.wob += V.wobV * Math.min(dt, 1 / 30);
      u.mag.rotation.z = clamp(V.wob * 0.12, -0.5, 0.5); u.mag.rotation.x = Math.sin(t * 2.3) * 0.06 - clamp(sp * 0.02, 0, 0.2);
      u.spark.material.opacity = 0.45 + 0.55 * Math.abs(Math.sin(t * 23)) * (0.5 + V.pull);
      u.spark.scale.setScalar((0.12 + V.pull * 0.14) * (0.8 + Math.random() * 0.4));
      if (near) this.magnetSwirl(P, V, dt, t, V.pull);
    } else if (id === 'boots') {
      // les ressorts s'écrasent à l'atterrissage et s'étirent au saut
      V.squash = Math.max(0, (V.squash || 0) - dt * 4); V.stretch = Math.max(0, (V.stretch || 0) - dt * 3);
      const run = Math.min(1, sp / 6), bounce = P.grounded ? Math.abs(Math.sin(P.phase || 0)) * 0.2 * run : 0;
      let k = 1 - Math.sin(V.squash * Math.PI) * 0.55 + Math.sin(V.stretch * Math.PI) * 0.45 - bounce;
      if (!P.grounded && !pound) k = Math.max(k, 1.15 + clamp(P.vel.y * 0.015, -0.1, 0.25));
      if (pound) k = 0.6;
      k = clamp(k, 0.35, 1.6);
      for (const b of V.boots) b.userData.spring.scale.y = k;
      if (!ride) P.mesh.position.y += V.lift * k;
      if (pound && near && Math.random() < dt * 40) g.spawnParticle(P.pos.x + (Math.random() - 0.5) * 0.6, P.pos.y + 0.4, P.pos.z + (Math.random() - 0.5) * 0.6, 0, 4, 0, 0xffffff, 0.2, 0.3, 0, KIND.spark);
    } else if (id === 'cape') {
      this.animateCape(P, V, dt, t, sp, near);
    }
  }
  dressDog(P, id) {
    const V = { id, parts: [] }, u = P.mesh.userData;
    if (!id) return V;
    const add = (obj, parent) => { parent.add(obj); V.parts.push(obj); if (this.lite) obj.traverse(o => { o.castShadow = false; }); if (!this.g.realistic) T.toonify(obj); return obj; };
    if (id === 'magnet') {
      const hs = WR.hatSpot(P);
      if (!hs) return V;
      const h = V.hat = buildHat(this.lite);
      h.position.set(hs.at[0], hs.at[1], hs.at[2]); h.scale.setScalar(hs.at[3] * 1.1); h.rotation.z = -0.12;
      add(h, hs.anchor);
    } else if (id === 'boots') {
      // une botte au bout de chaque patte qui touche le sol (en duo : celles d'Ainu)
      const root = P.mesh, legs = u.legs || [];
      const keep = legs.map(l => l.rotation.clone());
      for (const l of legs) l.rotation.set(0, 0, 0);
      root.updateMatrixWorld(true);
      V.boots = []; V.lift = 0;
      const rs = root.getWorldScale(this.v).x || 1;
      for (const leg of legs) {
        const hip = root.worldToLocal(leg.getWorldPosition(this.v2.set(0, 0, 0)).clone());
        const len = Math.max(0.2, hip.y);
        const foot = leg.worldToLocal(root.localToWorld(new THREE.Vector3(hip.x, 0, hip.z)));
        const bs = leg.getWorldScale(new THREE.Vector3()).x / rs;
        const s = (len / 0.72) * (u.ainu ? 1 : 1.25);
        const b = buildBoot(this.lite);
        b.position.copy(foot); b.scale.setScalar(s / bs);
        add(b, leg); V.boots.push(b);
        V.lift = Math.max(V.lift, b.userData.H * s * 0.9);
      }
      legs.forEach((l, i) => l.rotation.copy(keep[i]));
    } else if (id === 'cape') {
      // (en duo, c'est Ainu qui porte la cape : Matcha s'assoit dessus, et elle flotte derrière eux)
      const at = u.ainu ? CAPE_AT.ainu : P.kind === 'matcha' ? CAPE_AT.matcha : null;
      let parent = u.ainu ? u.ainu : u.matcha, A = at;
      if (!A) {
        // un copain (carlin, yorkshire) : on se cale sur sa tête et sa taille
        const hd = u.mhead; parent.updateMatrixWorld(true);
        const hp = parent.worldToLocal(hd.getWorldPosition(new THREE.Vector3()));
        const ps = parent.getWorldScale(new THREE.Vector3()).x || 1, H = (u.height || 0.8) / ps;
        A = { p: [0, hp.y - H * 0.12, hp.z - H * 0.22], W: H * 0.5, H: H * 0.95, back: 0.5, k: H * 1.0 };
      }
      const c = V.cape = buildCape(this.lite, A.W, A.H);
      c.position.set(...A.p); c.userData.back = A.back;
      c.userData.rockets.scale.setScalar(A.k); c.userData.flame.scale.setScalar(A.k);
      add(c, parent);
      V.capeA = A; V.flow = 0; V.gl = 0; V.rk = 0;
      this.animateCape(P, V, 0, 0, 0, true);
    }
    return V;
  }
  unwear(V) { for (const o of V.parts) if (o.parent) o.parent.remove(o); }

  /** Le tissu de la cape : couché sur le dos, il retombe derrière ; il flotte quand on court et se tend quand on plane. */
  animateCape(P, V, dt, t, sp, near) {
    const c = V.cape; if (!c) return;
    const u = c.userData, geo = u.geo, pos = geo.attributes.position;
    const k = 1 - Math.exp(-(dt || 1) * 6);
    V.flow = ease(V.flow, clamp(sp / 9, 0, 1), k);
    V.gl = ease(V.gl, P.gliding ? 1 : 0, k);
    V.rk = ease(V.rk, P.rocketT > 0 ? 1 : 0, 1 - Math.exp(-(dt || 1) * 12));
    V.fall = ease(V.fall || 0, P.grounded ? 0 : clamp(-P.vel.y * 0.05, -0.5, 0.6), k);
    const W = u.W * (1 + V.gl * 0.3 + V.rk * 0.1), H = u.H, back = u.back;
    const rest = (1 - V.flow) * (1 - V.gl) * (1 - V.rk);
    const amp = 0.04 + V.flow * 0.1 + V.gl * 0.12 + V.rk * 0.2, freq = 7 + V.flow * 6 + V.rk * 10;
    const rows = 10, cols = 7, ds = H / (rows - 1);
    let y = 0, z = 0;
    for (let j = 0; j < rows; j++) {
      const v = j / (rows - 1);
      // angle avec la verticale : 1,5 ≈ à plat vers l'arrière, 0 = qui pend
      const phiRest = ease(1.44, 0.15, sstep(back - 0.06, back + 0.22, v));
      const phiFlow = 1.45 - 0.35 * v * (1 - V.flow);
      let phi = ease(phiRest, phiFlow, 1 - rest);
      phi = ease(phi, 1.2 + 0.18 * v, Math.max(V.gl, V.rk));
      phi += V.fall * v + Math.sin(t * freq - v * 6.5) * amp * v * 1.6;
      if (j > 0) { y -= Math.cos(phi) * ds; z -= Math.sin(phi) * ds; }
      const nY = -Math.sin(phi), nZ = Math.cos(phi);      // vers le corps (le tissu retombe dessus)
      const hw = W / 2 * (0.62 + 0.55 * v);
      for (let i = 0; i < cols; i++) {
        const uu = i / (cols - 1) * 2 - 1;
        const curl = W * 0.42 * uu * uu * (0.35 + 0.65 * rest) * (1 - 0.4 * v) * (1 - V.gl * 0.8);
        const wave = Math.sin(t * freq * 0.8 - v * 5 + uu * 1.7) * amp * 0.3 * v;
        pos.setXYZ(j * cols + i, uu * hw * (1 - 0.12 * rest * uu * uu), y + nY * curl + wave * 0.5, z + nZ * curl);
      }
    }
    pos.needsUpdate = true;
    if (near || !dt) geo.computeVertexNormals();
    geo.computeBoundingSphere();
    // la fusée : flammes, fumée, étincelles
    u.flame.visible = V.rk > 0.05;
    if (u.flame.visible) { const f = 0.75 + Math.random() * 0.5; u.flame.scale.set(u.rockets.scale.x * (0.9 + Math.random() * 0.2), u.rockets.scale.x * f * V.rk, u.rockets.scale.x * f * V.rk); }
    if (dt && near) this.capeTrail(P, V, dt);
  }

  /** Les particules autour du chapeau-aimant : un tourbillon rouge et bleu (plus fort quand des trésors arrivent). */
  magnetSwirl(P, V, dt, t, pull) {
    const g = this.g, rate = (this.lite ? 7 : 11) + pull * (this.lite ? 22 : 34);
    V.acc = Math.min(4, (V.acc || 0) + rate * dt);
    while (V.acc >= 1) {
      V.acc -= 1;
      const a = t * 5 + Math.random() * TAU, r = 1.05 + pull * 0.5 + Math.random() * 0.25, h = 0.3 + Math.random() * 1.6;
      const col = Math.random() < 0.5 ? 0xff7a7a : 0x8ad8ff;
      // tangent (il tourne) et un peu vers le chien
      g.spawnParticle(P.pos.x + Math.cos(a) * r, P.pos.y + h, P.pos.z + Math.sin(a) * r, -Math.sin(a) * 3 - Math.cos(a) * 0.8 * (1 + pull), 0.3, Math.cos(a) * 3 - Math.sin(a) * 0.8 * (1 + pull), col, 0.12 + pull * 0.05, 0.45, -0.5, KIND.spark, { drag: 0.6 });
    }
    // une traînée d'étincelles sur chaque trésor attiré
    if (pull > 0.05 && g.boneMag) for (const m of g.boneMag.values()) if (m.P === P && Math.random() < dt * 30) g.spawnParticle(m.x, m.y, m.z, 0, 0.2, 0, Math.random() < 0.5 ? 0xffe070 : 0x9ad8ff, 0.15, 0.35, 0, KIND.spark);
  }
  capeTrail(P, V, dt) {
    const g = this.g, c = V.cape;
    if (V.rk > 0.3) {
      const n = Math.random() < dt * (this.lite ? 40 : 70) ? 2 : 0;
      for (let i = 0; i < n; i++) {
        const p = c.localToWorld(this.v.set((Math.random() < 0.5 ? -1 : 1) * 0.13 * c.userData.rockets.scale.x, -0.1, -0.35 * c.userData.rockets.scale.x));
        g.spawnParticle(p.x, p.y, p.z, -P.vel.x * 0.15 + (Math.random() - 0.5), -1 - Math.random(), -P.vel.z * 0.15 + (Math.random() - 0.5), 0xf0ece8, 0.42 + Math.random() * 0.2, 0.7, -0.8, KIND.puff);
        g.spawnParticle(p.x, p.y, p.z, (Math.random() - 0.5) * 2, -2 - Math.random() * 2, (Math.random() - 0.5) * 2, Math.random() < 0.5 ? 0xffd040 : 0xff7a30, 0.16, 0.4, 3, KIND.spark);
      }
    } else if (V.gl > 0.5 && Math.random() < dt * 14) {
      const p = c.localToWorld(this.v.set((Math.random() - 0.5) * c.userData.W, -0.05, -c.userData.H * 0.9));
      g.spawnParticle(p.x, p.y, p.z, 0, 0.2, 0, Math.random() < 0.6 ? 0xfff2b0 : 0xc8b0ff, 0.14, 0.6, -0.2, KIND.star);
    }
  }
  rocketFx(P) {
    const g = this.g;
    this.sfxAt(P, 'rocket');
    g.juice.dust(P.pos.x, P.pos.y - 0.2, P.pos.z, 0.5, 0xf4f0ea);
    g.juice.sparkle(P.pos.x, P.pos.y + 0.8, P.pos.z, 10, 0xffd060, 0.8);
    g.jiggle(P, 2.4);
    if (P === g.me) { g.kick(0.1); g.haptic(P, 14, 0); }
  }
  poundFx(P) {
    const g = this.g, s = g.support(P.pos.x, P.pos.z, P.pos.y + 0.6);
    this.sfxAt(P, 'thud');
    this.sfxAt(P, 'boing');
    g.juice.dust(P.pos.x, s.y, P.pos.z, 1, L.SURFACE === 'snow' ? 0xf4f8ff : L.SURFACE === 'sand' ? 0xf0dcae : 0xe8dcc4);
    g.juice.hitStars(P.pos.x, s.y + 0.4, P.pos.z, 8, 0x8af0d0);
    // un anneau d'onde de choc au ras du sol
    const n = this.lite ? 14 : 22;
    for (let i = 0; i < n; i++) { const a = i / n * TAU; g.spawnParticle(P.pos.x + Math.cos(a) * 0.5, s.y + 0.15, P.pos.z + Math.sin(a) * 0.5, Math.cos(a) * 9, 0.4, Math.sin(a) * 9, 0xffffff, 0.22, 0.35, 0, KIND.spark, { drag: 4 }); }
    g.jiggle(P, -3);
    if (P === g.me) { g.kick(0.35, 0.05); g.juice.punch(0.4); g.haptic(P, [16, 30, 10], 0); }
    if (P.pwv) P.pwv.squash = 1;
  }
  /** Le changement de costume : une bouffée d'étincelles, des confettis et une petite fanfare. */
  swapFx(P, id) {
    const g = this.g, x = P.pos.x, y = P.pos.y, z = P.pos.z;
    const col = id ? new THREE.Color(powerDef(id).color).getHex() : 0xffffff;
    g.juice.dust(x, y, z, 0.7, 0xffffff);
    g.juice.sparkle(x, y + 0.9, z, 18, 0xfff0a0, 1.1);
    g.juice.hitStars(x, y + 1, z, 8, col);
    if (id) g.juice.confetti(x, y + 1.4, z, 24, 0.7);
    g.burst(x, y + 0.8, z, 14, col, 3, 0.6);
    g.jiggle(P, 3);
    if (P !== g.me) this.sfxAt(P, 'wearFar');
  }

  // ----------------------------------------------------------------- sons
  /** Un son pour un chien : le mien en entier, ceux des amis s'ils sont tout près. */
  sfxAt(P, name) {
    const g = this.g;
    if (P !== g.me) { const d = P.pos.distanceTo(g.me.pos); if (d > 22) return; }
    this.sing(name, P === g.me ? 1 : 0.5);
  }
  sing(name, vol) {
    const s = this.g.sfx; vol = vol === undefined ? 1 : vol;
    if (!s || !s.ok) return;
    switch (name) {
      case 'wear':   // la petite fanfare du costume (arpège qui monte + clochettes)
        [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => s.note('mallet', m + 12, 0.08 * vol, i * 0.055, i === 6 ? 0.5 : 0.18));
        s.note('bell', 91, 0.07 * vol, 0.4, 0.8);
        if (s.sparkle) s.sparkle(86, 5, 0.05);
        if (s.whoosh) s.whoosh(0.4, { lo: 600, hi: 2600, vol: 0.06 * vol });
        break;
      case 'wearFar': [67, 72, 79].forEach((m, i) => s.note('mallet', m + 12, 0.05 * vol, i * 0.06)); break;
      case 'off': [79, 74, 67].forEach((m, i) => s.note('mallet', m, 0.07 * vol, i * 0.06)); break;
      case 'boing':   // « boing ! » : le ressort qui se détend (glissando qui monte et vibre)
        s.tone(140, 0.28, { type: 'sine', to: 620, vol: 0.16 * vol });
        s.tone(620, 0.22, { type: 'triangle', to: 380, vol: 0.06 * vol, delay: 0.12 });
        s.tone(1500, 0.1, { type: 'triangle', to: 1100, vol: 0.025 * vol, delay: 0.02 });
        break;
      case 'boingS': s.tone(260, 0.14, { type: 'sine', to: 180, vol: 0.07 * vol }); s.tone(900, 0.07, { type: 'triangle', to: 700, vol: 0.02 * vol }); break;
      case 'pound': if (s.whoosh) s.whoosh(0.3, { lo: 1800, hi: 500, vol: 0.12 * vol }); s.tone(700, 0.25, { type: 'sine', to: 200, vol: 0.05 * vol }); break;
      case 'thud': s.tone(110, 0.3, { type: 'sine', to: 38, vol: 0.32 * vol }); s.noise(0.25, { filter: 'lowpass', freq: 700, freqTo: 120, vol: 0.25 * vol }); break;
      case 'rocket':
        s.noise(0.55, { filter: 'bandpass', freq: 380, freqTo: 2600, vol: 0.22 * vol });
        s.tone(160, 0.45, { type: 'sawtooth', to: 560, vol: 0.05 * vol });
        s.note('mallet', 84, 0.05 * vol, 0.02, 0.2); s.note('mallet', 91, 0.05 * vol, 0.1, 0.3);
        break;
    }
  }

  // ----------------------------------------------------------------- interface
  buildHud() {
    const g = this.g, root = g.dom && g.dom.root;
    if (!root) return;
    if (!document.getElementById('pw-css')) {
      const st = document.createElement('style'); st.id = 'pw-css';
      st.textContent = `
      .pw-badge { display: flex; align-items: center; gap: 6px; margin-top: 6px; pointer-events: auto; cursor: pointer; width: max-content; }
      .pw-badge.hidden { display: none; }
      .pw-ring { --g: 1; width: 44px; height: 44px; border-radius: 50%; padding: 4px; box-sizing: border-box; position: relative;
        background: conic-gradient(var(--c) calc(var(--g) * 360deg), rgba(255,255,255,0.25) 0); box-shadow: 0 0 0 2px rgba(60,36,10,0.8), 0 4px 10px rgba(0,0,0,0.35); }
      .pw-ring::before { content: ''; position: absolute; inset: 4px; border-radius: 50%; background: radial-gradient(circle at 40% 30%, #fffdf6, #f2e6cc); }
      .pw-ring img { position: relative; width: 100%; height: 100%; display: block; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.35)); }
      .pw-ring.full { animation: pwReady 0.5s cubic-bezier(0.2, 1.8, 0.4, 1); }
      .pw-badge b { font: 700 13px/1.1 var(--af, sans-serif); color: #fff; background: rgba(28,22,18,0.62); border: 1.5px solid rgba(232,192,112,0.55); padding: 4px 9px; border-radius: 10px;
        max-width: 160px; overflow: hidden; white-space: nowrap; transition: max-width 0.5s, opacity 0.5s, padding 0.5s; }
      .pw-badge.quiet b { max-width: 0; opacity: 0; padding: 4px 0; border-width: 0; }
      .pw-badge.pop .pw-ring { animation: pwPop 0.6s cubic-bezier(0.2, 1.8, 0.4, 1); }
      @keyframes pwPop { 0% { transform: scale(0.3) rotate(-40deg); } 100% { transform: scale(1) rotate(0); } }
      @keyframes pwReady { 50% { transform: scale(1.18); } }
      .wr-sec { font: 700 15px var(--af, sans-serif); color: #6a4a2a; margin: 4px 0 2px; text-align: left; }
      .wr-item .ic img { width: 34px; height: 34px; display: block; }
      .wr-item.pw.on { border-color: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 40%, transparent); }
      #adv.photo-on .pw-badge { visibility: hidden; }`;
      document.head.appendChild(st);
    }
    const el = this.hud = document.createElement('div');
    el.className = 'pw-badge hidden quiet';
    el.innerHTML = '<div class="pw-ring"><img alt=""></div><b></b>';
    el.addEventListener('click', (e) => { e.stopPropagation(); if (g.dom.overlay.classList.contains('hidden')) g.showOverlay('wardrobe'); });
    const party = root.querySelector('.adv-party');
    (party || root.querySelector('.adv-hud') || root).appendChild(el);
    this.hudId = undefined;
    this.btnJump = root.querySelector('.adv-btn.jump span'); this.btnAtk = root.querySelector('.adv-btn.attack span');
  }
  hudShow(pop) {
    if (!this.hud) return;
    this.hudId = undefined; this.hudPop = !!pop;
  }
  updateHud() {
    const el = this.hud, g = this.g, P = g.me;
    if (!el || !P) return;
    const id = P.power || null;
    if (id !== this.hudId) {
      this.hudId = id;
      el.classList.toggle('hidden', !id);
      if (id) {
        const def = powerDef(id);
        el.querySelector('img').src = ICONS[id];
        el.querySelector('b').textContent = def.name;
        el.querySelector('.pw-ring').style.setProperty('--c', def.color);
        el.classList.remove('quiet');
        if (this.hudPop) { el.classList.remove('pop'); void el.offsetWidth; el.classList.add('pop'); }
        clearTimeout(this.quietTo);
        this.quietTo = setTimeout(() => el.classList.add('quiet'), 3500);
      }
      this.hudPop = false;
    }
    if (id === 'cape') {
      const gv = Math.round((P.rocketG === undefined ? 1 : P.rocketG) * 20) / 20;
      if (gv !== this.hudG) {
        const ring = el.querySelector('.pw-ring');
        ring.style.setProperty('--g', gv);
        if (gv >= 1 && this.hudG < 1) { ring.classList.remove('full'); void ring.offsetWidth; ring.classList.add('full'); }
        this.hudG = gv;
      }
    } else if (this.hudG !== 1) { el.querySelector('.pw-ring').style.setProperty('--g', 1); this.hudG = 1; }
    // les boutons du téléphone disent ce qu'ils font maintenant
    if (g.isTouch && this.btnJump) {
      const jl = canRocket(P) ? 'Fusée !' : 'Saut', al = canPound(P) ? 'Plongeon' : 'Attaque';
      if (this.btnJump.textContent !== jl) this.btnJump.textContent = jl;
      if (this.btnAtk.textContent !== al) this.btnAtk.textContent = al;
    }
  }
  /** Les pouvoirs dans la garde-robe. */
  wardrobeHtml() {
    const o = WR.outfit(), n = WR.rewards(), cur = this.g.me.power || null;
    const cell = (p) => {
      const ok = powerUnlocked(p.id, o.found, n), on = cur === p.id;
      return `<button class="wr-item pw${on ? ' on' : ''}${ok ? '' : ' locked'}" style="--c:${p.color}" ${ok ? `data-a="power:${on ? 'none' : p.id}"` : 'disabled'}><span class="ic">${ok ? `<img src="${ICONS[p.id]}" alt="">` : '🔒'}</span><b>${p.name}</b><small>${ok ? (on ? 'Porté · enlever' : 'Mettre') : `Une boîte à costume, ou ${p.need} récompenses`}</small></button>`;
    };
    return `<div class="wr-sec">✨ Costumes à pouvoir (un seul à la fois)</div><div class="wr-grid">${POWERS.map(cell).join('')}</div><div class="wr-sec">🎩 Chapeaux et colliers</div>`;
  }
}
