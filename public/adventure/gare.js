/*
 * Matcha & Ainu — la Gare des Mondes (au Parc) et les petits arrêts « Retour au Parc »
 * (dans les autres mondes) : on voyage entre les mondes en train, plus de portails.
 *
 *  - Au Parc : un quai en bois sous une marquise, une locomotive à l'arrêt, un grand
 *    plan des 8 mondes, une cloche et un guichet. On monte sur le quai : le choix du
 *    monde s'ouvre (8 grandes cartes-billets), on choisit, le train siffle, on part.
 *  - Ailleurs : un poteau d'arrêt avec son petit toit, sa cloche et sa pancarte
 *    « Retour au Parc ». Tout le monde se tient sur le petit quai rond : on rentre.
 *
 * À plusieurs : on part tous ensemble. Seul l'hôte choisit le monde ; il faut que tout
 * le monde soit sur le quai. (Les règles d'attente sont celles des anciens portails.)
 */
import * as THREE from '../vendor/three.module.min.js';
import * as K from './parkkit.js';

/** Les 8 mondes (nom, couleur, petite image, illustration du menu). */
export const WORLDS = {
  1: { name: 'Le Parc des Toutous', emo: '🌳', col: '#3fae68', sub: 'Le petit train et le Grand Chêne' },
  2: { name: 'La Forêt des Moustaches', emo: '🍄', col: '#3a7fd0', sub: 'Lanternes et champignons' },
  3: { name: 'Port-Croquette', emo: '⚓', col: '#ee8a2c', sub: 'La grande ville au bord de l\'eau' },
  4: { name: 'Les Îles du Ciel', emo: '☁️', col: '#9a62dc', sub: 'Des îles dans les nuages' },
  5: { name: 'La Station des Neiges', emo: '❄️', col: '#4aa8e0', sub: 'Luge et boules de neige' },
  6: { name: 'La Plage aux Coquillages', emo: '🐚', col: '#22b8b4', sub: 'Creuser et surfer' },
  7: { name: 'La Ferme de Papi Berger', emo: '🐑', col: '#e0a818', sub: 'Les chiens de berger' },
  8: { name: 'Le Château des Chats', emo: '🏰', col: '#e0528a', sub: 'Énigmes et grande fête' },
};
const IDS = [1, 2, 3, 4, 5, 6, 7, 8];
const img = (id) => `img/levels/l${id}.jpg`;

// ---------------------------------------------------------------------------
// Petit assembleur qui garde les UV (pour le grain du bois peint)
// ---------------------------------------------------------------------------
const _c = new THREE.Color(), _c2 = new THREE.Color();
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
/** Une couleur un peu « faite main » : chaque pièce a sa nuance. */
const tone = (hex, k) => { _c2.setHex(hex); const v = 1 + (rnd() - 0.5) * (k || 0.12); return _c2.setRGB(Math.min(1, _c2.r * v), Math.min(1, _c2.g * v), Math.min(1, _c2.b * v)).getHex(); };
class UKit {
  constructor() { this.list = []; }
  add(geo, color, t) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      if (typeof color === 'function') color(p.getX(i), p.getY(i), p.getZ(i), _c); else _c.set(color === undefined ? 0xffffff : color);
      col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (!g.attributes.normal) g.computeVertexNormals();
    this.list.push(Object.assign({ geo: g }, t || {}));
    return this;
  }
  /** Une géométrie déjà peinte (modèles du parc). */
  addPainted(geo, t) { this.list.push(Object.assign({ geo: geo.index ? geo.toNonIndexed() : geo }, t || {})); return this; }
  box(w, h, d, color, t) { const g = new THREE.BoxGeometry(w, h, d); const uv = g.attributes.uv; const s = Math.max(w, d, h); for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * s * 0.6, uv.getY(i) * 0.6); return this.add(g, color, t); }
  geo() {
    let n = 0;
    const gs = this.list.map(({ geo, x, y, z, rx, ry, rz, sx, sy, sz }) => {
      const g = geo.clone();
      g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x || 0, y || 0, z || 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, ry || 0, rz || 0, 'YXZ')), new THREE.Vector3(sx || 1, sy || sx || 1, sz || sx || 1)));
      n += g.attributes.position.count;
      return g;
    });
    const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
    let o = 0;
    for (const g of gs) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, o * 3);
      nor.set(g.attributes.normal.array, o * 3);
      if (g.attributes.color) col.set(g.attributes.color.array, o * 3); else col.fill(1, o * 3, (o + c) * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
      o += c;
      g.dispose();
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    out.setAttribute('color', new THREE.BufferAttribute(col, 3));
    out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    out.computeBoundingSphere();
    return out;
  }
}
/** Grain doux de bois peint (blanc cassé, fibres à peine visibles) : multiplie les couleurs. */
let grainTex = null;
function grain() {
  if (grainTex) return grainTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f4f0ea'; x.fillRect(0, 0, 256, 256);
  seed = 5;
  for (let i = 0; i < 140; i++) {
    const y = rnd() * 256, a = 0.03 + rnd() * 0.07, w = 0.6 + rnd() * 1.6;
    x.strokeStyle = `rgba(${rnd() < 0.5 ? '90,60,30' : '255,255,255'},${a})`; x.lineWidth = w;
    x.beginPath(); x.moveTo(0, y);
    for (let k = 0; k <= 256; k += 32) x.lineTo(k, y + Math.sin(k * 0.03 + i) * (1 + rnd() * 3));
    x.stroke();
  }
  for (let i = 0; i < 10; i++) { x.fillStyle = 'rgba(80,50,20,0.10)'; x.beginPath(); x.ellipse(rnd() * 256, rnd() * 256, 2 + rnd() * 4, 1 + rnd() * 2, 0, 0, 7); x.fill(); }
  x.fillStyle = '#fbf8f2'; x.fillRect(0, 0, 4, 4);   // (les pièces sans UV prennent ce coin : neutre)
  grainTex = new THREE.CanvasTexture(c);
  grainTex.colorSpace = THREE.SRGBColorSpace; grainTex.wrapS = grainTex.wrapT = THREE.RepeatWrapping; grainTex.anisotropy = 4;
  return grainTex;
}
const mats = {};
const woodMat = () => mats.wood || (mats.wood = new THREE.MeshStandardMaterial({ vertexColors: true, map: grain(), roughness: 0.88, metalness: 0 }));
const brassMat = () => mats.brass || (mats.brass = new THREE.MeshStandardMaterial({ color: 0xe0ac48, metalness: 0.65, roughness: 0.32, emissive: 0x3a2400, emissiveIntensity: 0.25 }));

// couleurs (peintures douces, pas de plastique)
const WOOD = 0xb88352, WOOD_D = 0x7e5233, CREAM = 0xf4e7c8, GREEN = 0x4e8a66, GREEN_D = 0x3a6a4e, ROOF = 0xc9604a, ROOF_D = 0xa84a38, STONE = 0xbdb2a0, GRAVEL = 0x9a8e7e, STEEL = 0x8c9098;

/** Une cloche (pivot en haut, la bouche vers le bas). */
function bellGeo(r) {
  const pts = [];
  for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector2(r * (0.38 + 0.62 * Math.pow(t, 1.7)) + (t > 0.9 ? r * 0.12 * (t - 0.9) * 10 : 0), -t * r * 1.5)); }
  const g = new THREE.LatheGeometry(pts, 16);
  const k = new UKit();
  k.add(g, 0xffffff, { y: -0.06 });
  k.add(new THREE.SphereGeometry(r * 0.38, 10, 8), 0xffffff, { y: -0.06 });
  k.add(new THREE.SphereGeometry(r * 0.2, 8, 6), 0xc8c0b0, { y: -r * 1.45 });          // le battant
  k.add(new THREE.TorusGeometry(r * 0.22, r * 0.07, 6, 12), 0xffffff, { y: 0 });
  const out = k.geo(); out.deleteAttribute('uv');
  return out;
}

// ---------------------------------------------------------------------------
// La Gare des Mondes (repère : l'avant du quai vers +z, le quai le long de x)
// ---------------------------------------------------------------------------
export const GARE_DIM = { len: 10, depth: 3.8, top: 0.42, trackZ: -3.05 };
function stationGeo() {
  seed = 21;
  const k = new UKit(), T = GARE_DIM.top, HL = GARE_DIM.len / 2;
  // socle de pierre (descend sous le sol : pas de vide si le terrain penche)
  k.add(new THREE.BoxGeometry(GARE_DIM.len + 0.2, 1.3, GARE_DIM.depth), (x, y, z, c) => c.setHex(STONE).multiplyScalar(0.9 + 0.12 * Math.sin(x * 3.1 + z * 2.3) * Math.sin(y * 7 + x)), { y: T - 0.12 - 0.65 });
  // le plancher : des planches un peu inégales
  for (let i = 0; i < 7; i++) k.box(GARE_DIM.len, 0.1, 0.52, tone(WOOD, 0.16), { y: T - 0.05, z: -1.62 + i * 0.54 });
  k.box(GARE_DIM.len + 0.1, 0.14, 0.16, CREAM, { y: T - 0.04, z: GARE_DIM.depth / 2 - 0.02 });         // bordure du quai
  k.box(GARE_DIM.len + 0.1, 0.12, 0.12, CREAM, { y: T - 0.05, z: -GARE_DIM.depth / 2 + 0.04 });
  // deux marches devant
  k.box(2.0, 0.22, 0.5, tone(WOOD_D), { y: 0.11 - 0.02, z: GARE_DIM.depth / 2 + 0.25 });
  // la marquise : 4 poteaux verts, consoles, poutres, toit de tuiles et lambrequin crème
  const PX = 2.9, PZ = 1.3, BY = 3.05;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    k.add(new THREE.CylinderGeometry(0.09, 0.11, BY - T, 10), GREEN, { x: sx * PX, y: T + (BY - T) / 2, z: sz * PZ });
    k.box(0.3, 0.12, 0.3, GREEN_D, { x: sx * PX, y: T + 0.06, z: sz * PZ });
    k.box(0.26, 0.1, 0.26, GREEN_D, { x: sx * PX, y: BY - 0.05, z: sz * PZ });
    for (const d of [-1, 1]) k.box(0.07, 0.62, 0.07, GREEN, { x: sx * PX + d * 0.26, y: BY - 0.3, z: sz * PZ, rz: d * 0.72 });   // consoles
  }
  for (const sz of [-1, 1]) k.box(PX * 2 + 0.5, 0.16, 0.14, GREEN_D, { y: BY + 0.02, z: sz * PZ });
  for (const sx of [-1, 1]) k.box(0.14, 0.16, PZ * 2, GREEN_D, { x: sx * PX, y: BY + 0.02 });
  const RW = PX * 2 + 1.1, RIDGE = BY + 0.78, EZ = 2.0, EY = BY - 0.02, A = Math.atan2(RIDGE - EY, EZ), SL = Math.hypot(EZ, RIDGE - EY);
  for (const sz of [-1, 1]) {
    const at = (s) => ({ y: RIDGE - s * Math.sin(A), z: sz * s * Math.cos(A) });
    const m = at(SL / 2);
    k.box(RW, 0.08, SL + 0.08, ROOF_D, { y: m.y, z: m.z, rx: sz * A });
    for (let r = 0; r < 5; r++) {                                                                   // rangs de tuiles
      const p = at(0.25 + r * 0.42);
      k.box(RW + 0.04, 0.07, 0.4, r % 2 ? ROOF : tone(ROOF, 0.08), { y: p.y + 0.06, z: p.z, rx: sz * A });
    }
    const e = at(SL);                                                                              // bord festonné
    for (let x = -RW / 2 + 0.17; x < RW / 2; x += 0.34) k.add(new THREE.SphereGeometry(0.17, 10, 6), tone(ROOF, 0.1), { x, y: e.y + 0.03, z: e.z + sz * 0.02, sy: 0.4, sz: 0.7 });
    // lambrequin : planche crème et ses dents
    k.box(RW - 0.1, 0.2, 0.05, CREAM, { y: EY - 0.08, z: sz * (EZ - 0.12) });
    for (let x = -RW / 2 + 0.2; x < RW / 2 - 0.1; x += 0.3) k.add(new THREE.ConeGeometry(0.1, 0.2, 4), CREAM, { x, y: EY - 0.28, z: sz * (EZ - 0.12), rx: Math.PI, ry: Math.PI / 4, sz: 0.35 });
  }
  k.add(new THREE.CylinderGeometry(0.1, 0.1, RW + 0.1, 10), ROOF_D, { y: RIDGE + 0.04, rz: Math.PI / 2 });          // faîtage
  for (const sx of [-1, 1]) k.add(new THREE.SphereGeometry(0.13, 10, 8), 0xe8b84a, { x: sx * (RW / 2 + 0.08), y: RIDGE + 0.08 });
  // pignons crème (triangles) sous le toit
  for (const sx of [-1, 1]) {
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([0, RIDGE - 0.06, 0, 0, EY, -EZ + 0.15, 0, EY, EZ - 0.15, 0, RIDGE - 0.06, 0, 0, EY, EZ - 0.15, 0, EY, -EZ + 0.15], 3));
    tri.computeVertexNormals();
    k.add(tri, CREAM, { x: sx * (RW / 2 - 0.25) });
  }
  // le panneau du nom, debout sur le faîtage (le texte : à part)
  k.box(3.7, 0.86, 0.1, WOOD_D, { y: RIDGE + 0.62, z: 0.02 });
  for (const sx of [-1, 1]) k.box(0.1, 0.5, 0.1, WOOD_D, { x: sx * 1.4, y: RIDGE + 0.1 });
  // l'horloge, sous la poutre de devant
  k.box(0.06, 0.3, 0.06, GREEN_D, { y: BY - 0.2, z: PZ + 0.05 });
  k.add(new THREE.CylinderGeometry(0.33, 0.33, 0.1, 22), (x, y, z, c) => c.setHex(Math.hypot(x, z) > 0.27 ? GREEN_D : 0xfff8e8), { y: BY - 0.66, z: PZ + 0.05, rx: Math.PI / 2 });
  k.box(0.035, 0.2, 0.02, 0x2a2a30, { y: BY - 0.6, z: PZ + 0.12 });
  k.box(0.14, 0.03, 0.02, 0x2a2a30, { x: 0.06, y: BY - 0.66, z: PZ + 0.12 });
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; k.box(0.04, 0.04, 0.02, 0x2a2a30, { x: Math.cos(a) * 0.22, y: BY - 0.66 + Math.sin(a) * 0.22, z: PZ + 0.11 }); }
  // un banc contre le fond
  for (let i = 0; i < 3; i++) k.box(1.8, 0.06, 0.14, tone(0xa86a3a), { x: -1.0, y: T + 0.46, z: -1.25 + i * 0.17 });
  for (let i = 0; i < 2; i++) k.box(1.8, 0.12, 0.05, tone(0xa86a3a), { x: -1.0, y: T + 0.7 + i * 0.18, z: -1.42, rx: -0.15 });
  for (const sx of [-0.75, 0.75]) k.box(0.08, 0.48, 0.5, 0x3a3a40, { x: -1.0 + sx, y: T + 0.24, z: -1.08 });
  // jardinières fleuries aux coins de devant
  for (const sx of [-1, 1]) {
    const x = sx * 2.35, z = 1.45;
    k.box(0.7, 0.42, 0.5, tone(WOOD_D), { x, y: T + 0.21, z });
    k.box(0.62, 0.06, 0.42, 0x5a3a20, { x, y: T + 0.42, z });
    for (let i = 0; i < 7; i++) k.add(new THREE.SphereGeometry(0.1 + rnd() * 0.05, 8, 6), [0xff8ab8, 0xffd860, 0xffffff, 0xff6a6a, 0xb890ff][i % 5], { x: x - 0.25 + (i % 4) * 0.17, y: T + 0.52 + rnd() * 0.08, z: z - 0.1 + (i % 2) * 0.18 });
    for (let i = 0; i < 5; i++) k.add(new THREE.SphereGeometry(0.12, 7, 5), 0x5a9a4a, { x: x - 0.22 + i * 0.11, y: T + 0.47, z: z + (i % 2 ? 0.1 : -0.1), sy: 0.6 });
  }
  // le guichet (à gauche) : murs crème, colombages, fenêtre, toit pointu
  {
    const gx = -HL + 0.85, gz = -0.55, W = 1.5, H = 2.1;
    k.box(W, H, 1.6, CREAM, { x: gx, y: T + H / 2, z: gz });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) k.box(0.1, H, 0.1, WOOD_D, { x: gx + sx * W / 2, y: T + H / 2, z: gz + sz * 0.8 });
    k.box(W + 0.06, 0.1, 1.66, WOOD_D, { x: gx, y: T + H - 0.05, z: gz });
    k.box(W + 0.06, 0.1, 1.66, WOOD_D, { x: gx, y: T + 0.9, z: gz });
    k.box(0.86, 0.66, 0.04, 0x3a5a7a, { x: gx, y: T + 1.45, z: gz + 0.81 });                        // la vitre du guichet
    k.box(0.98, 0.08, 0.12, WOOD_D, { x: gx, y: T + 1.08, z: gz + 0.86 });                          // la tablette
    k.box(0.98, 0.06, 0.06, WOOD_D, { x: gx, y: T + 1.81, z: gz + 0.83 });
    k.box(0.06, 0.66, 0.05, WOOD_D, { x: gx, y: T + 1.45, z: gz + 0.84 });
    k.add(new THREE.ConeGeometry(1.3, 1.0, 4), (x, y, z, c) => c.setHex(y < -0.3 ? ROOF_D : ROOF), { x: gx, y: T + H + 0.5, z: gz, ry: Math.PI / 4, sz: 1.1 });
    k.add(new THREE.SphereGeometry(0.1, 8, 6), 0xe8b84a, { x: gx, y: T + H + 1.02, z: gz });
    k.box(1.05, 0.3, 0.06, WOOD_D, { x: gx, y: T + 2.0, z: gz + 0.82 });                            // (la pancarte « Billets » : à part)
    // une petite lanterne
    k.box(0.05, 0.4, 0.05, 0x2a2a30, { x: gx + 0.9, y: T + 1.75, z: gz + 0.8 });
    k.box(0.18, 0.24, 0.18, 0xffe8a8, { x: gx + 0.9, y: T + 1.5, z: gz + 0.8 });
  }
  // le grand plan des mondes (à droite), sur deux pieds, avec son petit toit
  {
    const bx = HL - 1.15, bz = -0.35, BW = 2.4, BH = 1.66, BC = T + 1.75;
    for (const sx of [-1, 1]) k.box(0.13, BC + BH / 2 + 0.25 - T, 0.13, WOOD_D, { x: bx + sx * (BW / 2 + 0.02), y: T + (BC + BH / 2 + 0.25 - T) / 2, z: bz });
    k.box(BW + 0.24, BH + 0.24, 0.1, WOOD_D, { x: bx, y: BC, z: bz - 0.03 });
    k.box(BW + 0.7, 0.07, 0.62, ROOF_D, { x: bx, y: BC + BH / 2 + 0.36, z: bz + 0.08, rx: 0.32 });
    k.box(BW + 0.7, 0.07, 0.4, ROOF, { x: bx, y: BC + BH / 2 + 0.37, z: bz + 0.12, rx: 0.32 });
    k.box(BW, 0.08, 0.16, WOOD_D, { x: bx, y: BC - BH / 2 - 0.1, z: bz + 0.06 });
  }
  // la voie : ballast, traverses, rails, butoirs
  const TZ = GARE_DIM.trackZ, TL = GARE_DIM.len + 1.6;
  k.add(new THREE.BoxGeometry(TL + 0.6, 0.9, 2.5), (x, y, z, c) => c.setHex(GRAVEL).multiplyScalar(0.9 + 0.15 * Math.sin(x * 9.1 + z * 7.7)), { y: -0.37, z: TZ });
  for (let x = -TL / 2 + 0.3; x < TL / 2; x += 0.62) k.box(0.3, 0.1, 2.0, tone(WOOD_D, 0.2), { x, y: 0.12, z: TZ });
  for (const sz of [-0.72, 0.72]) { k.box(TL, 0.1, 0.08, STEEL, { y: 0.22, z: TZ + sz }); k.box(TL, 0.04, 0.14, STEEL, { y: 0.17, z: TZ + sz }); }
  for (const sx of [-1, 1]) {
    k.box(0.3, 0.42, 2.0, (x, y, z, c) => c.setHex(Math.floor((z + 1) * 3) % 2 ? 0xd84a3a : 0xf4f0e8), { x: sx * (TL / 2 + 0.05), y: 0.55, z: TZ });
    for (const sz of [-0.6, 0.6]) k.box(0.18, 0.62, 0.18, WOOD_D, { x: sx * (TL / 2 + 0.2), y: 0.31, z: TZ + sz });
  }
  // le train des mondes, à l'arrêt : locomotive et deux wagons (ceux du petit train du parc)
  k.addPainted(K.locoGeo(), { x: 2.4, y: 0.24, z: TZ, ry: Math.PI / 2 });
  k.addPainted(K.wagonGeo(0xf0c040), { x: -0.9, y: 0.24, z: TZ, ry: Math.PI / 2 });
  k.addPainted(K.wagonGeo(0x3a8ae0), { x: -3.85, y: 0.24, z: TZ, ry: Math.PI / 2 });
  return k.geo();
}

// ---------------------------------------------------------------------------
// Les planches peintes (une seule texture pour la gare : nom, « Billets », plan)
// ---------------------------------------------------------------------------
const AT = { sign: [0, 0, 1024, 224], tick: [0, 232, 512, 120], map: [0, 360, 1024, 664] };
function roundRect(x, X, Y, W, H, r) { x.beginPath(); x.roundRect(X, Y, W, H, r); }
function drawSign(x) {
  const [X, Y, W, H] = AT.sign;
  const g = x.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, '#fff6dc'); g.addColorStop(1, '#f1dfb4');
  x.fillStyle = '#6a4228'; x.fillRect(X, Y, W, H);
  roundRect(x, X + 14, Y + 14, W - 28, H - 28, 26); x.fillStyle = g; x.fill();
  x.lineWidth = 8; x.strokeStyle = '#3a6a4e'; roundRect(x, X + 30, Y + 30, W - 60, H - 60, 18); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 104px Fredoka, "Arial Rounded MT Bold", sans-serif';
  x.lineJoin = 'round'; x.lineWidth = 10; x.strokeStyle = '#fff8e8'; x.strokeText('Gare des Mondes', W / 2, Y + H / 2 + 6, W - 200);
  x.fillStyle = '#2e5a40'; x.fillText('Gare des Mondes', W / 2, Y + H / 2 + 6, W - 200);
  x.font = '64px sans-serif'; x.fillText('🚂', X + 92, Y + H / 2 + 4); x.fillText('✨', X + W - 92, Y + H / 2 + 2);
}
function drawTicket(x) {
  const [X, Y, W, H] = AT.tick;
  x.fillStyle = '#6a4228'; x.fillRect(X, Y, W, H);
  roundRect(x, X + 8, Y + 8, W - 16, H - 16, 14); x.fillStyle = '#fff3d4'; x.fill();
  x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = '#a8442f';
  x.font = '700 76px Fredoka, "Arial Rounded MT Bold", sans-serif'; x.fillText('Billets', X + W / 2, Y + H / 2 + 4);
}
/** Le grand plan : une voie qui fait le tour des 8 mondes (images du menu dans des médaillons). */
function drawMap(x, visited, here, pics) {
  const [X, Y, W, H] = AT.map;
  const g = x.createRadialGradient(W / 2, Y + H / 2, 60, W / 2, Y + H / 2, W * 0.62);
  g.addColorStop(0, '#fbf1d8'); g.addColorStop(1, '#e8d2a2');
  x.fillStyle = g; x.fillRect(X, Y, W, H);
  // petites collines et arbres dessinés à la main
  x.fillStyle = 'rgba(120,170,90,0.22)';
  for (let i = 0; i < 9; i++) { x.beginPath(); x.ellipse(60 + i * 118, Y + H - 24 - (i % 3) * 10, 90, 40, 0, Math.PI, 0); x.fill(); }
  x.fillStyle = 'rgba(80,140,200,0.18)'; x.beginPath(); x.ellipse(W / 2, Y + H / 2 + 20, 190, 92, 0, 0, 7); x.fill();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '700 50px Fredoka, "Arial Rounded MT Bold", sans-serif'; x.fillStyle = '#7a4a28'; x.fillText('Les 8 Mondes', W / 2, Y + H / 2 + 14);
  // la voie (ovale) : traverses puis rails
  const cx = W / 2, cy = Y + H / 2 + 16, rx = 400, ry = 218;
  const at = (a) => [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry];
  for (let a = 0; a < Math.PI * 2; a += 0.05) { const [px, py] = at(a); const n = Math.atan2(Math.sin(a) * rx, Math.cos(a) * ry); x.save(); x.translate(px, py); x.rotate(n); x.fillStyle = '#8a6040'; x.fillRect(-14, -3, 28, 6); x.restore(); }
  for (const d of [-7, 7]) { x.strokeStyle = '#6a6a72'; x.lineWidth = 3.5; x.beginPath(); x.ellipse(cx, cy, rx + d, ry + d, 0, 0, 7); x.stroke(); }
  IDS.forEach((id, i) => {
    const a = -Math.PI / 2 + i / 8 * Math.PI * 2, [px, py] = at(a), w = WORLDS[id], open = visited.has(id), R = 62;
    x.save();
    x.beginPath(); x.arc(px, py, R + 9, 0, 7); x.fillStyle = open ? w.col : '#a8a49c'; x.fill();
    x.beginPath(); x.arc(px, py, R + 2, 0, 7); x.fillStyle = '#fffaf0'; x.fill();
    x.beginPath(); x.arc(px, py, R - 3, 0, 7); x.clip();
    if (pics[id]) { x.filter = open ? 'none' : 'grayscale(1) brightness(1.08) contrast(0.8)'; x.drawImage(pics[id], px - R * 1.4, py - R, R * 2.8, R * 2.1); x.filter = 'none'; }
    else { x.fillStyle = open ? w.col : '#c8c4bc'; x.fillRect(px - R, py - R, R * 2, R * 2); x.font = '58px sans-serif'; x.fillStyle = '#fff'; x.fillText(w.emo, px, py + 4); }
    if (!open) { x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(px - R, py - R, R * 2, R * 2); }
    x.restore();
    if (!open) { x.font = '40px sans-serif'; x.fillText('🔒', px + R * 0.62, py - R * 0.6); }
    // le nom, sur une petite étiquette
    const short = w.name.replace(/^(Le |La |Les )/, '');
    x.font = '700 30px Fredoka, "Arial Rounded MT Bold", sans-serif';
    const tw = Math.min(250, x.measureText(short).width + 26), ty = py + R + (Math.sin(a) > 0.3 ? -R * 2 - 34 : 22);
    roundRect(x, px - tw / 2, ty - 19, tw, 38, 19); x.fillStyle = open ? '#fffaf0' : '#ece8e0'; x.fill();
    x.lineWidth = 3; x.strokeStyle = open ? w.col : '#a8a49c'; x.stroke();
    x.fillStyle = open ? '#4a3020' : '#8a8680'; x.fillText(short, px, ty + 2, tw - 14);
    if (id === here) { x.font = '44px sans-serif'; x.fillText('📍', px - R * 0.7, py - R * 0.62); }
  });
}
/** Planches de la gare : une texture, un maillage (nom sur le toit, « Billets », plan). */
function gareBoards(visited, here) {
  const c = document.createElement('canvas'); c.width = c.height = 1024;
  const x = c.getContext('2d');
  const pics = {};
  const paint = () => { x.clearRect(0, 0, 1024, 1024); drawSign(x); drawTicket(x); drawMap(x, visited, here, pics); tex.needsUpdate = true; };
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  paint();
  // les illustrations du menu, dès qu'elles arrivent (puis les polices)
  let left = IDS.length;
  for (const id of IDS) { const im = new Image(); im.onload = () => { pics[id] = im; if (--left === 0) paint(); }; im.onerror = () => { if (--left === 0) paint(); }; im.src = img(id); }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => paint());
  const T = GARE_DIM.top, HL = GARE_DIM.len / 2;
  const quad = (rect, w, h, t) => {
    const g = new THREE.PlaneGeometry(w, h), uv = g.attributes.uv, [X, Y, W, H] = rect;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (X + uv.getX(i) * W) / 1024, 1 - (Y + (1 - uv.getY(i)) * H) / 1024);
    g.applyMatrix4(new THREE.Matrix4().makeTranslation(t.x, t.y, t.z));
    return g;
  };
  const RIDGE = 3.05 + 0.78;
  const parts = [
    quad(AT.sign, 3.5, 3.5 * 224 / 1024, { x: 0, y: RIDGE + 0.62, z: 0.08 }),
    quad(AT.tick, 0.98, 0.98 * 120 / 512, { x: -HL + 0.85, y: T + 2.0, z: -0.55 + 0.86 }),
    quad(AT.map, 2.4, 2.4 * 664 / 1024, { x: HL - 1.15, y: T + 1.75, z: -0.35 + 0.03 }),
  ];
  const k = new UKit(); for (const p of parts) k.add(p, 0xffffff);
  const m = new THREE.Mesh(k.geo(), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 }));
  m.userData.noOutline = true;
  return { mesh: m, tex, repaint: paint };
}

// ---------------------------------------------------------------------------
// L'arrêt « Retour au Parc » (repère : la pancarte regarde +z ; on se tient en (0, 0))
// ---------------------------------------------------------------------------
function stopGeo() {
  seed = 33;
  const k = new UKit();
  // le petit quai rond, en planches
  k.add(new THREE.CylinderGeometry(1.42, 1.5, 0.6, 28), (x, y, z, c) => c.setHex(y > 0.2 ? CREAM : STONE), { y: -0.18 });
  for (let i = 0; i < 6; i++) {
    const w = 0.4, z = -1.0 + i * w, half = Math.sqrt(Math.max(0.05, 1.2 * 1.2 - (Math.abs(z) + w / 2) ** 2));
    k.box(half * 2, 0.08, w - 0.03, tone(WOOD, 0.16), { y: 0.14, z });
  }
  // le poteau d'arrêt, derrière le quai
  const PZ = -1.75;
  k.box(0.2, 2.9, 0.2, WOOD_D, { y: 1.35, z: PZ });
  k.box(0.38, 0.2, 0.38, STONE, { y: 0.05, z: PZ });
  // le bras et son petit toit (la cloche dessous)
  k.box(1.25, 0.12, 0.12, WOOD_D, { x: 0.45, y: 2.55, z: PZ });
  k.box(0.08, 0.5, 0.08, WOOD_D, { x: 0.25, y: 2.3, z: PZ, rz: 0.75 });
  for (const sz of [-1, 1]) k.box(1.0, 0.06, 0.52, sz > 0 ? ROOF : ROOF_D, { x: 0.75, y: 3.0, z: PZ + sz * 0.22, rx: sz * 0.62 });
  k.add(new THREE.CylinderGeometry(0.05, 0.05, 1.04, 8), ROOF_D, { x: 0.75, y: 3.16, z: PZ, rz: Math.PI / 2 });
  for (const sx of [0.3, 1.2]) k.box(0.06, 0.48, 0.06, WOOD_D, { x: sx, y: 2.78, z: PZ });
  k.add(new THREE.SphereGeometry(0.1, 8, 6), 0xe8b84a, { y: 2.88, z: PZ });
  // la pancarte suspendue (le texte : à part)
  k.box(1.98, 0.84, 0.07, WOOD_D, { y: 1.8, z: PZ + 0.12 });
  for (const sx of [-0.75, 0.75]) k.box(0.03, 0.2, 0.03, 0x4a4a50, { x: sx, y: 2.3, z: PZ + 0.12 });
  k.box(2.1, 0.08, 0.08, WOOD_D, { y: 2.42, z: PZ + 0.12 });
  // un pot de fleurs au pied
  k.add(new THREE.CylinderGeometry(0.22, 0.17, 0.32, 12), 0xc87850, { x: -0.42, y: 0.16, z: PZ + 0.1 });
  for (let i = 0; i < 5; i++) k.add(new THREE.SphereGeometry(0.09, 7, 5), [0xff8ab8, 0xffd860, 0xffffff, 0xff6a6a, 0xb890ff][i], { x: -0.42 + Math.cos(i * 1.3) * 0.11, y: 0.37 + (i % 2) * 0.05, z: PZ + 0.1 + Math.sin(i * 1.3) * 0.11 });
  // un petit banc à côté
  for (let i = 0; i < 3; i++) k.box(1.1, 0.05, 0.12, tone(0xa86a3a), { x: 1.9, y: 0.44, z: -0.95 + i * 0.14 });
  k.box(1.1, 0.12, 0.05, tone(0xa86a3a), { x: 1.9, y: 0.68, z: -1.08, rx: -0.15 });
  for (const sx of [-0.45, 0.45]) k.box(0.07, 0.44, 0.4, 0x3a3a40, { x: 1.9 + sx, y: 0.22, z: -0.82 });
  return k.geo();
}
function stopSign(locked) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 208;
  const x = c.getContext('2d');
  const paint = (lk) => {
    x.clearRect(0, 0, 512, 208);
    roundRect(x, 6, 6, 500, 196, 22); x.fillStyle = '#fff4d6'; x.fill();
    x.lineWidth = 7; x.strokeStyle = lk ? '#9a968e' : '#3a6a4e'; roundRect(x, 18, 18, 476, 172, 16); x.stroke();
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = '66px sans-serif'; x.fillText(lk ? '🔒' : '🚂', 84, 106);
    x.fillStyle = lk ? '#8a8680' : '#2e5a40';
    x.font = '700 64px Fredoka, "Arial Rounded MT Bold", sans-serif'; x.fillText('Retour', 304, 74, 330);
    x.fillStyle = lk ? '#8a8680' : '#c8573e'; x.fillText('au Parc', 304, 140, 330);
    tex.needsUpdate = true;
  };
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  paint(locked);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => paint(locked));
  const g = new THREE.PlaneGeometry(1.86, 1.86 * 208 / 512); g.translate(0, 1.8, -1.75 + 0.16);
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.82 }));
  m.userData.noOutline = true;
  return { mesh: m, paint };
}

// ---------------------------------------------------------------------------
// Sons : cloche (ding-ding) et sifflet de locomotive, avec un peu de vapeur
// ---------------------------------------------------------------------------
export function bellSound(s) { if (!s || !s.ok) return; s.note('bell', 88, 0.07, 0, 0.5); s.note('bell', 88, 0.06, 0.22, 0.6); }
export function whistleSound(s) {
  if (!s || !s.ok) return;
  // deux notes ensemble (comme un vrai sifflet à vapeur), qui montent un peu puis tiennent
  for (const [f, v] of [[587, 0.07], [740, 0.06], [880, 0.035]]) { s.tone(f * 0.94, 0.16, { type: 'triangle', to: f, vol: v }); s.tone(f, 0.75, { type: 'triangle', to: f * 1.01, vol: v, delay: 0.14 }); }
  if (s.noise) { s.noise(0.9, { filter: 'bandpass', freq: 2400, freqTo: 1800, vol: 0.05 }); s.noise(0.5, { freq: 900, freqTo: 300, vol: 0.09, delay: 0.95 }); }
}

// ---------------------------------------------------------------------------
// Le choix du monde (8 grandes cartes-billets), au doigt comme au clavier
// ---------------------------------------------------------------------------
const CSS = `
.gare-pick { position: absolute; inset: 0; z-index: 30; display: flex; align-items: center; justify-content: center; padding: max(8px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(8px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
  background: radial-gradient(ellipse at center, rgba(40, 26, 12, 0.25), rgba(30, 18, 8, 0.6)); animation: gpfade 0.25s ease-out; touch-action: manipulation; pointer-events: auto; }
@keyframes gpfade { from { opacity: 0; } to { opacity: 1; } }
.gp-panel { position: relative; width: min(980px, 100%); max-height: 100%; display: flex; flex-direction: column; gap: clamp(6px, 1.6vh, 12px);
  padding: clamp(8px, 2vh, 16px) clamp(10px, 2vw, 20px) clamp(10px, 2.4vh, 18px); border-radius: 26px; color: #4a3020;
  background: #f8ecd2 linear-gradient(180deg, rgba(255,255,255,0.55), rgba(255,255,255,0) 40%);
  border: 6px solid #8a5a34; box-shadow: inset 0 0 0 3px #f8ecd2, inset 0 0 0 5px rgba(138, 90, 52, 0.35), 0 18px 40px rgba(0,0,0,0.4);
  animation: gpin 0.42s cubic-bezier(0.2, 1.5, 0.4, 1); }
@keyframes gpin { from { transform: translateY(30px) scale(0.86); opacity: 0; } to { transform: none; opacity: 1; } }
.gp-head { display: flex; align-items: center; gap: 12px; padding: 0 4px; }
.gp-head .gp-loco { font-size: clamp(26px, 6.5vh, 40px); filter: drop-shadow(0 2px 0 rgba(0,0,0,0.15)); animation: gpchug 0.9s ease-in-out infinite; }
@keyframes gpchug { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-3px) rotate(2deg); } }
.gp-head b { display: block; font-size: clamp(20px, 5vh, 30px); line-height: 1; color: #2e5a40; }
.gp-head small { display: block; font-size: clamp(13px, 3vh, 17px); color: #8a6040; margin-top: 2px; font-weight: 600; }
.gp-head .gp-t { flex: 1; text-align: left; }
.gp-x { flex: none; width: clamp(40px, 10vh, 50px); height: clamp(40px, 10vh, 50px); border-radius: 50%; border: 3px solid #8a5a34; background: #fff6e0; color: #8a5a34;
  font: 700 clamp(18px, 4.6vh, 24px) var(--af, sans-serif); cursor: pointer; box-shadow: 0 3px 0 #c8a878; padding: 0; }
.gp-x:active { transform: translateY(2px); box-shadow: 0 1px 0 #c8a878; }
.gp-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: clamp(6px, 1.6vh, 12px); overflow-y: auto; padding: 4px; -webkit-overflow-scrolling: touch; }
@media (max-aspect-ratio: 1/1) { .gp-grid { grid-template-columns: repeat(2, 1fr); } }
.gp-w { position: relative; display: flex; flex-direction: column; padding: 0; border: 4px solid #fffaf0; border-radius: 18px; overflow: hidden; cursor: pointer;
  background: var(--c); color: #fff; font: inherit; text-align: center; box-shadow: 0 4px 0 color-mix(in srgb, var(--c) 60%, #000), 0 8px 14px rgba(60, 30, 10, 0.22);
  transition: transform 0.16s cubic-bezier(0.3, 1.6, 0.5, 1), box-shadow 0.16s; outline: none; -webkit-tap-highlight-color: transparent; min-height: 0; }
.gp-w .gp-img { display: block; width: 100%; height: clamp(58px, 21vh, 150px); background-size: cover; background-position: center; border-bottom: 3px solid #fffaf0; }
.gp-w .gp-emo { position: absolute; top: 6px; left: 6px; width: clamp(30px, 8vh, 42px); height: clamp(30px, 8vh, 42px); border-radius: 50%; background: #fffaf0; border: 3px solid var(--c);
  display: flex; align-items: center; justify-content: center; font-size: clamp(16px, 4.4vh, 24px); box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.gp-w .gp-n { display: block; padding: clamp(4px, 1.2vh, 8px) 6px 0; font-size: clamp(13px, 3.4vh, 19px); font-weight: 700; line-height: 1.05; text-shadow: 0 2px 0 rgba(0,0,0,0.22); }
.gp-w .gp-s { display: block; padding: 2px 6px clamp(5px, 1.4vh, 9px); font-size: clamp(10px, 2.5vh, 13px); font-weight: 600; opacity: 0.92; line-height: 1.1; }
.gp-w::before, .gp-w::after { content: ''; position: absolute; top: calc(clamp(58px, 21vh, 150px) - 6px); width: 14px; height: 14px; border-radius: 50%; background: #f8ecd2; z-index: 1; }
.gp-w::before { left: -11px; } .gp-w::after { right: -11px; }
.gp-w:hover, .gp-w.on { transform: translateY(-4px) scale(1.04) rotate(-0.6deg); box-shadow: 0 8px 0 color-mix(in srgb, var(--c) 60%, #000), 0 14px 22px rgba(60, 30, 10, 0.3); }
.gp-w.on { border-color: #ffd84a; }
.gp-w:active { transform: translateY(1px) scale(0.98); }
.gp-w.lock { background: #b8b2a8; box-shadow: 0 4px 0 #8a857c, 0 6px 10px rgba(60, 30, 10, 0.15); }
.gp-w.lock .gp-img { filter: grayscale(1) brightness(1.05) contrast(0.75); }
.gp-w.lock .gp-emo { border-color: #9a968e; filter: grayscale(1); }
.gp-w.lock .gp-lk { position: absolute; top: 0; left: 0; right: 0; height: clamp(58px, 21vh, 150px); display: flex; align-items: center; justify-content: center; font-size: clamp(26px, 8vh, 44px);
  background: rgba(255, 255, 255, 0.25); filter: drop-shadow(0 3px 2px rgba(0,0,0,0.3)); }
.gp-w.here { cursor: default; }
.gp-w.here .gp-img { filter: saturate(0.6) brightness(0.92); }
.gp-w .gp-here { position: absolute; top: 8px; right: 8px; background: #fffaf0; color: #2e5a40; border-radius: 999px; padding: 2px 9px; font-size: clamp(10px, 2.6vh, 13px); font-weight: 700; box-shadow: 0 2px 4px rgba(0,0,0,0.2); }
.gp-w.shake { animation: gpshake 0.4s; }
@keyframes gpshake { 20%, 60% { transform: translateX(-6px) rotate(-1deg); } 40%, 80% { transform: translateX(6px) rotate(1deg); } }
.gp-w.go { animation: gpgo 0.6s ease-in forwards; }
@keyframes gpgo { 30% { transform: scale(1.12) rotate(-2deg); } 100% { transform: scale(1.06) translateY(-6px); } }
.gp-w .gp-stamp { position: absolute; top: 26%; left: 50%; transform: translate(-50%, -50%) rotate(-14deg) scale(2); opacity: 0; padding: 4px 12px; border: 4px solid #c8402e; border-radius: 10px;
  color: #c8402e; background: rgba(255, 250, 240, 0.85); font-weight: 700; font-size: clamp(13px, 3.4vh, 19px); letter-spacing: 1px; z-index: 2; white-space: nowrap; }
.gp-w.go .gp-stamp { animation: gpstamp 0.3s 0.08s cubic-bezier(0.3, 1.6, 0.5, 1) forwards; }
@keyframes gpstamp { to { opacity: 1; transform: translate(-50%, -50%) rotate(-14deg) scale(1); } }
.gp-msg { min-height: 1.2em; text-align: center; font-size: clamp(12px, 3vh, 16px); color: #a8442f; font-weight: 700; }
.gare-hint { position: absolute; left: 50%; top: max(64px, calc(env(safe-area-inset-top) + 56px)); transform: translateX(-50%); z-index: 6; pointer-events: none; text-align: center;
  padding: 7px 18px 8px; border-radius: 16px; background: #f8ecd2; color: #4a3020; border: 4px solid #8a5a34; box-shadow: 0 4px 0 rgba(90, 50, 20, 0.35), 0 8px 16px rgba(0,0,0,0.25);
  max-width: min(440px, 62vw); animation: gphint 0.35s cubic-bezier(0.2, 1.6, 0.4, 1); }
@keyframes gphint { from { transform: translateX(-50%) translateY(-10px) scale(0.8); opacity: 0; } to { transform: translateX(-50%); opacity: 1; } }
.gare-hint b { display: block; font-size: clamp(15px, 3.8vh, 20px); color: #2e5a40; line-height: 1.1; }
.gare-hint small { display: block; font-size: clamp(12px, 3vh, 15px); font-weight: 600; color: #8a5a34; margin-top: 2px; }
.gare-hint small.ok { color: #3a8a4e; }
`;
function injectCss() {
  if (document.getElementById('gare-css')) return;
  const st = document.createElement('style'); st.id = 'gare-css'; st.textContent = CSS;
  document.head.appendChild(st);
}

class Picker {
  constructor(root, o) {
    this.o = o;
    const el = this.el = document.createElement('div');
    el.className = 'gare-pick';
    el.innerHTML = `<div class="gp-panel" role="dialog" aria-label="Gare des Mondes">
      <div class="gp-head"><span class="gp-loco">🚂</span><div class="gp-t"><b>Gare des Mondes</b><small>${o.coop ? 'Tout le monde est sur le quai : où va-t-on ?' : 'Où va-t-on aujourd\'hui ?'}</small></div><button class="gp-x" type="button" aria-label="Fermer">✕</button></div>
      <div class="gp-grid">${IDS.map((id) => {
        const w = WORLDS[id], lock = !o.visited.has(id) && id !== o.here, here = id === o.here;
        return `<button class="gp-w${lock ? ' lock' : ''}${here ? ' here' : ''}" type="button" data-id="${id}" style="--c:${w.col}">
          <i class="gp-img" style="background-image:url(${img(id)})"></i><span class="gp-emo">${w.emo}</span>
          ${lock ? '<span class="gp-lk">🔒</span>' : ''}${here ? '<span class="gp-here">📍 Tu es ici</span>' : ''}
          <span class="gp-n">${w.name}</span><span class="gp-s">${lock ? 'Pas encore découvert' : w.sub}</span><span class="gp-stamp">EN VOITURE !</span></button>`;
      }).join('')}</div>
      <div class="gp-msg"></div></div>`;
    root.appendChild(el);
    this.cards = [...el.querySelectorAll('.gp-w')];
    this.msg = el.querySelector('.gp-msg');
    const stop = (e) => e.stopPropagation();
    for (const ev of ['pointerdown', 'touchstart', 'touchend', 'mousedown']) el.addEventListener(ev, stop, { passive: true });
    el.querySelector('.gp-x').addEventListener('click', () => this.o.onClose());
    el.addEventListener('click', (e) => { if (e.target === el) this.o.onClose(); });
    this.cards.forEach((c, i) => {
      c.addEventListener('click', () => this.choose(i));
      c.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') this.focus(i); });
    });
    this.i = -1;
    if (!o.touch) this.focus(Math.max(0, this.cards.findIndex(c => !c.classList.contains('here') && !c.classList.contains('lock'))));
  }
  focus(i) { this.i = (i + this.cards.length) % this.cards.length; this.cards.forEach((c, k) => c.classList.toggle('on', k === this.i)); }
  cols() { return getComputedStyle(this.el.querySelector('.gp-grid')).gridTemplateColumns.split(' ').length || 4; }
  key(e) {
    const c = this.cols(), k = e.code;
    if (k === 'Escape' || k === 'Backspace') { this.o.onClose(); return true; }
    if (this.i < 0 && /Arrow|Key[WASD]/.test(k)) { this.focus(0); return true; }
    if (k === 'ArrowRight' || k === 'KeyD') this.focus(this.i + 1);
    else if (k === 'ArrowLeft' || k === 'KeyA') this.focus(this.i - 1);
    else if (k === 'ArrowDown' || k === 'KeyS') this.focus(this.i + c);
    else if (k === 'ArrowUp' || k === 'KeyW') this.focus(this.i - c);
    else if ((k === 'Enter' || k === 'Space' || k === 'KeyF') && this.i >= 0) this.choose(this.i);
    return true;
  }
  choose(i) {
    if (this.done) return;
    const c = this.cards[i], id = +c.dataset.id;
    this.focus(i);
    if (c.classList.contains('here')) { this.say('Vous êtes déjà au ' + WORLDS[id].name.replace(/^Le /, '') + ' !'); c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); return; }
    if (c.classList.contains('lock')) {
      this.say(`🔒 Commence « ${WORLDS[id].name} » depuis le menu principal : ensuite, le train t'y emmènera.`);
      c.classList.remove('shake'); void c.offsetWidth; c.classList.add('shake'); if (this.o.onLocked) this.o.onLocked(id); return;
    }
    if (this.o.canGo && !this.o.canGo()) { this.say('On attend tout le monde sur le quai !'); return; }
    this.done = true;
    c.classList.add('go');
    this.o.onPick(id);
  }
  say(t) { this.msg.textContent = t; }
  close() { if (this.el) this.el.remove(); this.el = null; }
}

// ---------------------------------------------------------------------------
// Le voyage : la gare (au Parc) ou l'arrêt (ailleurs), l'attente, le départ
// ---------------------------------------------------------------------------
/** Secondes à attendre à l'arrêt avant de partir (seul : presque tout de suite). */
const WAIT = (n) => (n > 1 ? 3 : 0.8);
export class Travel {
  /**
   * @param game le moteur (scene, players, banner, sound, usePortal…)
   * @param L le niveau ; L.GARE au Parc, sinon `list` donne les arrêts (vers le Parc)
   */
  constructor(game, L, list, visited) {
    injectCss();
    this.game = game; this.L = L; this.visited = visited;
    this.spots = [];
    this.hint = document.createElement('div'); this.hint.className = 'gare-hint hidden'; this.hint.innerHTML = '<b></b><small></small>';
    game.dom.root.appendChild(this.hint);
    this.hintKey = '';
    if (L.GARE) this.buildGare(L.GARE);
    for (const p of list) this.buildStop(p);
  }
  buildGare(G) {
    const game = this.game, y = G.y !== undefined ? G.y : this.L.heightAt(G.x, G.z);
    const grp = new THREE.Group(); grp.position.set(G.x, y, G.z); grp.rotation.y = G.yaw || 0;
    const body = new THREE.Mesh(stationGeo(), woodMat()); body.castShadow = true; body.receiveShadow = true; grp.add(body);
    const boards = gareBoards(this.visited, this.L.ID); grp.add(boards.mesh);
    const bell = new THREE.Mesh(bellGeo(0.16), brassMat()); bell.position.set(2.45, 3.0, 1.38); bell.castShadow = true; grp.add(bell);
    game.scene.add(grp);
    grp.updateMatrixWorld(true);
    // la cheminée de la locomotive (pour la vapeur), en coordonnées du monde
    const chim = new THREE.Vector3(2.4 + 1.0, 0.24 + 2.7, GARE_DIM.trackZ).applyMatrix4(grp.matrixWorld);
    const spot = { kind: 'gare', def: { x: G.x, z: G.z, to: 0 }, y, top: y + GARE_DIM.top, grp, bell, boards, chim, n: 0, t: 0, locked: false, pick: 0, name: 'Gare des Mondes', ring: 0, armed: true };
    this.spots.push(spot);
  }
  buildStop(p) {
    const game = this.game, L = this.L;
    let y = L.heightAt(p.x, p.z);
    for (let a = 0; a < 6.28; a += 0.79) y = Math.max(y, L.heightAt(p.x + Math.cos(a) * 1.3, p.z + Math.sin(a) * 1.3));
    const grp = new THREE.Group(); grp.position.set(p.x, y, p.z);
    grp.rotation.y = Math.atan2(L.START.x - p.x, L.START.z - p.z);
    const body = new THREE.Mesh(stopGeo(), woodMat()); body.castShadow = true; body.receiveShadow = true; grp.add(body);
    const sign = stopSign(false); grp.add(sign.mesh);
    const bell = new THREE.Mesh(bellGeo(0.13), brassMat()); bell.position.set(0.85, 2.72, -1.75); bell.castShadow = true; grp.add(bell);
    game.scene.add(grp);
    this.spots.push({ kind: 'stop', def: p, y: y + 0.18, grp, bell, sign, n: 0, t: 0, locked: false, pick: 0, name: WORLDS[p.to] ? WORLDS[p.to].name : 'Le Parc des Toutous', ring: 0 });
  }
  setLock(p, locked) {
    p.locked = locked;
    if (p.sign) p.sign.paint(locked);
    this.hintKey = '';
  }
  /** Qui est sur le quai de la gare (ou de l'arrêt) ? */
  onSpot(p, P) {
    if (p.kind === 'gare') {
      const G = this.L.GARE, a = G.yaw || 0, dx = P.pos.x - G.x, dz = P.pos.z - G.z;
      const lx = dx * Math.cos(a) - dz * Math.sin(a), lz = dx * Math.sin(a) + dz * Math.cos(a);
      return Math.abs(lx) < GARE_DIM.len / 2 + 0.1 && lz > -GARE_DIM.depth / 2 - 0.1 && lz < GARE_DIM.depth / 2 + 0.75 && P.pos.y > p.top - 0.5 && P.pos.y < p.top + 2.5;
    }
    return Math.hypot(P.pos.x - p.def.x, P.pos.z - p.def.z) < 1.7 && Math.abs(P.pos.y - p.y) < 2.5;
  }
  /** Bouton « VOYAGER » sur le quai. */
  candidates() {
    const out = [];
    for (const p of this.spots) if (p.kind === 'gare') {
      const G = this.L.GARE, c = Math.cos(G.yaw || 0), s = Math.sin(G.yaw || 0);
      for (const lx of [-3, 0, 3]) out.push({ kind: 'gare', label: 'VOYAGER', x: G.x + lx * c, z: G.z - lx * s, y: p.top });
    }
    return out;
  }
  gare() { return this.spots.find(p => p.kind === 'gare'); }
  interact(n, P) {
    const p = this.gare(), game = this.game;
    if (!p || game.guest) return;
    const total = game.players.length;
    if (p.n < total) { game.banner('On attend tout le monde !', `${p.n}/${total} sur le quai de la Gare des Mondes`, 2200); return; }
    this.open(p);
  }
  open(p) {
    const game = this.game;
    if (this.picker || this.leaving || game.dialog || game.cine || game.paused || game.portalBusy) return;
    p.pick = 1; p.armed = false;
    this.ring(p);
    this.hint.classList.add('hidden'); this.hintKey = '';
    this.picker = new Picker(game.dom.root, {
      visited: this.visited, here: this.L.ID, touch: game.isTouch, coop: game.players.length > 1,
      canGo: () => p.n === game.players.length,
      onClose: () => this.close(),
      onLocked: () => game.sound('bump'),
      onPick: (id) => this.depart(p, id),
    });
    game.sound('pop');
  }
  close() {
    if (this.picker) this.picker.close();
    this.picker = null;
    const p = this.gare(); if (p) p.pick = 0;
  }
  /** Le train siffle, la vapeur monte, on part (on garde le chemin des anciens portails). */
  depart(p, to) {
    const game = this.game;
    if (this.leaving) return;
    this.leaving = true;
    setTimeout(() => { this.close(); }, 520);
    this.ring(p);
    game.sound('whistle');
    if (game.coop) game.coopEvents.push(['sound', 'whistle']);
    game.banner('En voiture !', `Direction « ${WORLDS[to].name} »`, 2200);
    this.steam(p, 26);
    setTimeout(() => { if (!game.disposed) game.usePortal(to); }, 900);
  }
  ring(p) { p.ring = 1; this.game.sound('stationBell'); }
  steam(p, n) {
    const game = this.game, c = p.chim;
    if (!c) return;
    for (let i = 0; i < n; i++) game.spawnParticle(c.x + (Math.random() - 0.5) * 0.3, c.y + Math.random() * 0.3, c.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 1.2, 1.8 + Math.random() * 1.6, (Math.random() - 0.5) * 1.2, i % 3 ? 0xffffff : 0xe8ecf0, 0.45 + Math.random() * 0.4, 1.4 + Math.random() * 0.8, -1.2, 4);
  }
  onKey(e) {
    if (!this.picker) return false;
    e.preventDefault();
    if (!e.repeat) this.picker.key(e);
    return true;
  }

  /** Hôte : qui est là ? On part (ou on ouvre le choix) quand tout le monde est sur le quai. */
  step(dt) {
    const game = this.game;
    if (game.portalBusy) return;
    const players = game.players, total = players.length;
    if (this.picker) game.freeze = Math.max(game.freeze, 0.1);   // (tout le monde attend pendant le choix)
    for (const p of this.spots) {
      const prevN = p.n;
      p.n = players.filter(P => this.onSpot(p, P)).length;
      if (p.n > prevN && !this.leaving) this.ring(p);
      if (p.kind === 'gare') {
        if (this.leaving) continue;
        if (this.picker) { if (p.n < total) { this.close(); game.banner('On attend tout le monde !', 'Restez tous sur le quai pour choisir le monde', 2200); } continue; }
        if (p.n < total) p.armed = true;
        p.t = p.n === total ? p.t + dt : 0;
        if (p.n === total && p.armed && p.t >= (total > 1 ? 1.2 : 0.45)) this.open(p);
        continue;
      }
      if (p.locked) {
        if (p.n > 0 && game.t - (game.lockMsgT || -9) > 4) { game.lockMsgT = game.t; game.banner('🔒 Monde pas encore découvert', `Commence « ${p.name} » depuis le menu principal : ensuite, le train t'y ramènera.`, 3000); }
        p.n = 0; p.t = 0; continue;
      }
      const prev = p.t;
      p.t = p.n === total ? p.t + dt : 0;
      if (p.n === total && prev === 0 && total > 1) game.sound('switch');
      if (p.t >= WAIT(total)) { game.usePortal(p.def.to); return; }
    }
  }

  /** Chaque image : la cloche qui balance, un peu de vapeur, le message d'attente. */
  render(dt, t) {
    const game = this.game, me = game.me, total = game.players.length;
    let hint = null;
    for (const p of this.spots) {
      p.ring = Math.max(0, p.ring - dt * 0.7);
      p.bell.rotation.z = Math.sin(t * 9) * 0.5 * p.ring * p.ring + Math.sin(t * 1.3) * 0.03;
      if (p.kind === 'gare') {
        // la loco attend sous pression : un petit panache de temps en temps (plus fort pendant le choix)
        if (Math.random() < dt * (p.pick ? 6 : 1.2)) this.steam(p, 1);
      }
      if (!me || !this.onSpot(p, me) || game.cine) continue;
      if (p.kind === 'gare') {
        if (p.pick && !this.picker) hint = ['🚂 Gare des Mondes', game.guest ? 'L\'hôte choisit le monde…' : 'Choisissez votre monde !', true];
        else if (!this.picker) {
          if (p.n < total) hint = ['🚂 Gare des Mondes', `${p.n}/${total} sur le quai : on attend tout le monde !`, false];
          else hint = ['🚂 Gare des Mondes', game.guest ? 'L\'hôte choisit le monde…' : (total > 1 ? 'Tout le monde est là !' : 'Choisis ton monde !'), true];
        }
      } else {
        const need = WAIT(total);
        if (p.locked) hint = ['🔒 Retour au Parc', 'Monde pas encore découvert', false];
        else if (p.n > 0 && p.n < total) hint = ['🚏 Retour au Parc', `${p.n}/${total} à l'arrêt : on attend tout le monde !`, false];
        else if (p.n > 0 && total > 1) hint = ['🚏 Retour au Parc', `Tout le monde est là ! Départ dans ${Math.max(1, Math.ceil(need - p.t))}…`, true];
        else hint = ['🚏 Retour au Parc', 'Le train arrive… tchou tchou !', true];
      }
    }
    const key = hint ? hint.join('|') : '';
    if (key === this.hintKey) return;
    this.hintKey = key;
    if (!hint) { this.hint.classList.add('hidden'); return; }
    const wasHidden = this.hint.classList.contains('hidden');
    this.hint.querySelector('b').textContent = hint[0];
    const sm = this.hint.querySelector('small'); sm.textContent = hint[1]; sm.classList.toggle('ok', !!hint[2]);
    if (wasHidden) { this.hint.classList.remove('hidden'); this.hint.style.animation = 'none'; void this.hint.offsetWidth; this.hint.style.animation = ''; }
  }
  dispose() { this.close(); if (this.hint) this.hint.remove(); }
}
