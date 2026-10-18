/*
 * Matcha & Ainu — objets « sculptés » : fini les jouets en plastique (sphères, boîtes et cônes
 * lisses peints d'une couleur). Chaque objet a une silhouette modelée (lobes, plis, bourrelets),
 * une ombre portée dans les creux (couleur des sommets) et une vraie matière dessinée à la volée
 * (realtex.js : couleur + relief) : écorce annelée, palmes dentelées, feuilles, toile rayée,
 * planches, laine enroulée, corde de sisal, velours capitonné, neige tassée.
 * Même esprit que les sapins sculptés de foliage.js : pas de cartes transparentes clairsemées,
 * des volumes pleins, de la transparence seulement au bord des palmes.
 */
import * as THREE from '../vendor/three.module.min.js';
import * as RT from './realtex.js';
import { FOLIAGE } from './foliage.js';

function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function hash3(x, y, z) { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); }
/** Bruit de valeur 3D doux (pour cabosser les volumes). */
export function noise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const L = (a, b, t) => a + (b - a) * t;
  const h = (a, b, c) => hash3(ix + a, iy + b, iz + c);
  return L(L(L(h(0, 0, 0), h(1, 0, 0), u), L(h(0, 1, 0), h(1, 1, 0), u), v), L(L(h(0, 0, 1), h(1, 0, 1), u), L(h(0, 1, 1), h(1, 1, 1), u), v), w);
}

/** Constructeur de maillage : sommets (position, normale, uv, couleur) + groupes de matières. */
export function builder(nGroups = 1) {
  const B = { pos: [], nor: [], uv: [], col: [], idx: Array.from({ length: nGroups }, () => []), n: 0 };
  B.v = (x, y, z, nx, ny, nz, u, w, c) => {
    const l = Math.hypot(nx, ny, nz) || 1;
    B.pos.push(x, y, z); B.nor.push(nx / l, ny / l, nz / l); B.uv.push(u, w);
    if (Array.isArray(c)) B.col.push(c[0], c[1], c[2]); else B.col.push(c, c, c);
    return B.n++;
  };
  B.tri = (g, a, b, c) => B.idx[g].push(a, b, c);
  B.quad = (g, a, b, c, d) => B.idx[g].push(a, b, c, c, b, d);
  /** Grille rows × cols de sommets déjà créés (ids[r][c]) → triangles. */
  B.grid = (g, ids) => { for (let r = 0; r < ids.length - 1; r++) for (let c = 0; c < ids[r].length - 1; c++) B.quad(g, ids[r][c], ids[r + 1][c], ids[r][c + 1], ids[r + 1][c + 1]); };
  /** Ajoute une géométrie three (indexée ou non) dans le groupe g, transformée par m4, colorée par col(x,y,z,nx,ny,nz) ou une valeur. */
  B.add = (g, geo, m4, col, uvScale) => {
    const gi = geo.index, p = geo.attributes.position, nn = geo.attributes.normal, uu = geo.attributes.uv;
    const nm = m4 ? new THREE.Matrix3().getNormalMatrix(m4) : null, P = v3(0, 0, 0), N = v3(0, 0, 0), base = B.n;
    for (let i = 0; i < p.count; i++) {
      P.set(p.getX(i), p.getY(i), p.getZ(i)); N.set(nn.getX(i), nn.getY(i), nn.getZ(i));
      if (m4) { P.applyMatrix4(m4); N.applyMatrix3(nm).normalize(); }
      const c = typeof col === 'function' ? col(P.x, P.y, P.z, N.x, N.y, N.z, i) : col;
      const us = uvScale || [1, 1];
      B.v(P.x, P.y, P.z, N.x, N.y, N.z, uu ? uu.getX(i) * us[0] : 0, uu ? uu.getY(i) * us[1] : 0, c);
    }
    if (gi) for (let i = 0; i < gi.count; i++) B.idx[g].push(base + gi.getX(i));
    else for (let i = 0; i < p.count; i++) B.idx[g].push(base + i);
  };
  /** Une géométrie par groupe (mêmes sommets, index séparés). */
  B.geometries = () => B.idx.map((l) => {
    // (sommets propres à ce groupe seulement)
    const map = new Map(), pos = [], nor = [], uv = [], col = [], idx = [];
    for (const k of l) {
      let j = map.get(k);
      if (j === undefined) { j = pos.length / 3; map.set(k, j); pos.push(B.pos[k * 3], B.pos[k * 3 + 1], B.pos[k * 3 + 2]); nor.push(B.nor[k * 3], B.nor[k * 3 + 1], B.nor[k * 3 + 2]); uv.push(B.uv[k * 2], B.uv[k * 2 + 1]); col.push(B.col[k * 3], B.col[k * 3 + 1], B.col[k * 3 + 2]); }
      idx.push(j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeBoundingSphere();
    return g;
  });
  B.geometry = (opts = {}) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(B.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.col, 3));
    const all = []; let o = 0;
    B.idx.forEach((l, i) => { for (const k of l) all.push(k); if (nGroups > 1) g.addGroup(o, l.length, i); o += l.length; });
    g.setIndex(all);
    if (opts.normals) g.computeVertexNormals();
    g.computeBoundingSphere(); g.computeBoundingBox();
    return g;
  };
  return B;
}

/** Sphère cabossée (bruit doux) : boule de neige tassée, noix de coco, motte de feuillage. */
export function lumpySphere(r, detail, amt, freq, seed, squash) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), key = x.toFixed(4) + ',' + y.toFixed(4) + ',' + z.toFixed(4);
    let k = map.get(key);
    if (k === undefined) { k = 1 + (noise3(x * freq + seed, y * freq + seed * 0.7, z * freq - seed) - 0.5) * 2 * amt; map.set(key, k); }
    p.setXYZ(i, x * r * k, y * r * k * (squash || 1), z * r * k);
  }
  const m = mergeVerts(g);
  m.computeVertexNormals();
  return m;
}
/** Soude les sommets confondus (normales lisses). */
export function mergeVerts(g) {
  const p = g.attributes.position, map = new Map(), pos = [], uv = [], idx = [];
  const uu = g.attributes.uv;
  const n = g.index ? g.index.count : p.count;
  for (let j = 0; j < n; j++) {
    const i = g.index ? g.index.getX(j) : j;
    const key = p.getX(i).toFixed(4) + ',' + p.getY(i).toFixed(4) + ',' + p.getZ(i).toFixed(4);
    let k = map.get(key);
    if (k === undefined) { k = pos.length / 3; map.set(key, k); pos.push(p.getX(i), p.getY(i), p.getZ(i)); uv.push(uu ? uu.getX(i) : 0, uu ? uu.getY(i) : 0); }
    idx.push(k);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeVertexNormals();
  return out;
}

// =============================================================================
// Textures (dessinées une fois, partagées)
// =============================================================================
const TEX = {};
const once = (k, f) => TEX[k] || (TEX[k] = f());
/** Trait de pinceau sur les deux canevas (couleur, hauteur), répété aux bords (texture qui se raccorde). */
function wrapDraw(w, h, px, py, pad, fn) { for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) { if (px + ox < -pad || px + ox > w + pad || py + oy < -pad || py + oy > h + pad) continue; fn(px + ox, py + oy); } }

/** Écorce de palmier : un « anneau » par tuile (bourrelet clair en haut, creux sombre en bas), fibres. */
export function palmBarkTex() {
  return once('palmBark', () => RT.realTex(256, 256, 41, (x, y, w, h, R) => {
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#5a4128'); gr.addColorStop(0.12, '#a88458'); gr.addColorStop(0.3, '#9a7650'); gr.addColorStop(0.75, '#8a6844'); gr.addColorStop(0.93, '#6a4e32'); gr.addColorStop(1, '#3e2c1a');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    const hg = y.createLinearGradient(0, 0, 0, h);
    hg.addColorStop(0, '#202020'); hg.addColorStop(0.15, '#d0d0d0'); hg.addColorStop(0.5, '#a0a0a0'); hg.addColorStop(0.92, '#707070'); hg.addColorStop(1, '#101010');
    y.fillStyle = hg; y.fillRect(0, 0, w, h);
    // fibres verticales et petites écailles en losange
    for (let i = 0; i < 1600; i++) {
      const px = R() * w, py = R() * h, L = 6 + R() * 22, c = R();
      wrapDraw(w, h, px, py, 30, (X, Y) => {
        x.strokeStyle = c < 0.5 ? `rgba(60,40,22,${0.25 + R() * 0.3})` : `rgba(200,170,120,${0.15 + R() * 0.25})`;
        x.lineWidth = 1 + R() * 1.5; x.beginPath(); x.moveTo(X, Y); x.lineTo(X + (R() - 0.5) * 3, Y + L); x.stroke();
        const v = c < 0.5 ? 70 : 190; y.strokeStyle = `rgba(${v},${v},${v},0.35)`; y.lineWidth = 1.2; y.beginPath(); y.moveTo(X, Y); y.lineTo(X, Y + L); y.stroke();
      });
    }
    // bord effiloché de l'anneau (fibres qui pendent du bourrelet)
    for (let i = 0; i < 160; i++) {
      const px = R() * w, L = 8 + R() * 26;
      wrapDraw(w, h, px, 20, 40, (X) => { x.strokeStyle = `rgba(70,48,26,${0.4 + R() * 0.4})`; x.lineWidth = 1.5 + R() * 2; x.beginPath(); x.moveTo(X, 22); x.lineTo(X + (R() - 0.5) * 6, 22 + L); x.stroke(); });
    }
  }, { strength: 5 }));
}

/**
 * Palme : folioles serrées de part et d'autre d'une nervure (u : à travers, v : le long).
 * Opaque près de la nervure ; au bord, les pointes des folioles se séparent (bord dentelé : alpha).
 */
export function frondTex() {
  return once('frond', () => {
    const W = 256, H = 512;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.clearRect(0, 0, W, H);
    const R = rng(77);
    const leaflet = (side, y0, len, ang, col, dark) => {
      // foliole : longue feuille effilée, de la nervure vers le bord (vers la pointe de la palme)
      const sx = W / 2, sy = y0, ex = W / 2 + side * Math.cos(ang) * len, ey = y0 + Math.sin(ang) * len;
      const nx = -(ey - sy) / len, ny = (ex - sx) / len, wd = 9 + R() * 4;
      const g = x.createLinearGradient(sx, sy, ex, ey);
      g.addColorStop(0, dark); g.addColorStop(0.35, col); g.addColorStop(1, col);
      x.fillStyle = g;
      x.beginPath(); x.moveTo(sx, sy);
      x.quadraticCurveTo((sx + ex) / 2 + nx * wd * side, (sy + ey) / 2 + ny * wd * side, ex, ey);
      x.quadraticCurveTo((sx + ex) / 2 - nx * wd * side * 0.6, (sy + ey) / 2 - ny * wd * side * 0.6 + 4, sx, sy + 7);
      x.fill();
      // nervure claire de la foliole
      x.strokeStyle = 'rgba(230,240,170,0.35)'; x.lineWidth = 1; x.beginPath(); x.moveTo(sx, sy + 2); x.lineTo(ex, ey); x.stroke();
    };
    const greens = ['#4f9a2e', '#5aa834', '#468c2a', '#62b03a', '#3f8226', '#6cb842'];
    for (let i = 0; i < 150; i++) {
      const t = i / 150, y0 = 4 + t * (H - 24);
      for (const side of [-1, 1]) {
        const ang = 0.42 + R() * 0.12, len = W * 0.5 / Math.cos(ang) * (0.9 + R() * 0.1);   // vers le bas du canevas = vers la pointe de la palme
        leaflet(side, y0 + R() * 2, len, ang, greens[(R() * greens.length) | 0], '#2c5a1a');
      }
    }
    // nervure centrale (rachis) claire
    const rg = x.createLinearGradient(W / 2 - 5, 0, W / 2 + 5, 0);
    rg.addColorStop(0, '#6a8a30'); rg.addColorStop(0.5, '#d8d890'); rg.addColorStop(1, '#6a8a30');
    x.fillStyle = rg; x.fillRect(W / 2 - 4, 0, 8, H);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.ClampToEdgeWrapping;
    return t;
  });
}

// =============================================================================
// Palmier
// =============================================================================
/**
 * Un palmier complet (pied en 0,0,0), modelé pour un emplacement donné :
 * { h, lean, rot } comme level6.js. Rend { trunk (tronc + noix), fronds (palmes), top: [x, y, z] }.
 * Tronc segmenté (anneaux à bourrelet), un peu évasé au pied, courbé ; collerette fibreuse sous
 * la couronne ; 3-4 noix de coco cabossées ; palmes arquées qui retombent, pliées en V, dentelées.
 */
export function palmGeometry(pl, seed = 1, opts = {}) {
  const r = rng(seed * 9157 + 11), lite = !!opts.lite;
  const B = builder(2);
  const H = pl.h || 7, lean = pl.lean || 0, dirA = pl.rot || 0;
  // --- axe du tronc (comme l'ancien : le penchant augmente vers le haut) ---
  const nAx = 24, axis = [];
  {
    let x = 0, y = 0, z = 0;
    const dl = H / nAx;
    for (let i = 0; i <= nAx; i++) {
      axis.push(v3(x, y, z));
      const k = i / nAx, L = lean * (1 + k * 1.6);
      x += Math.cos(dirA) * Math.sin(L) * dl; z -= Math.sin(dirA) * Math.sin(L) * dl; y += Math.cos(L) * dl;
    }
  }
  const at = (t) => { const f = clamp(t, 0, 1) * nAx, i = Math.min(nAx - 1, Math.floor(f)), u = f - i; return axis[i].clone().lerp(axis[i + 1], u); };
  const tan = (t) => { const a = clamp(t, 0.01, 0.99); return at(a + 0.01).sub(at(a - 0.01)).normalize(); };
  // --- tronc : anneaux ---
  const rings = Math.round(H / 0.42), sides = lite ? 9 : 12;
  const rows = [];
  const prof = [];   // (t, rayon, v, ombre)
  for (let k = 0; k < rings; k++) {
    // dans chaque anneau : creux (bas), ventre, bourrelet (haut) ; v suit la tuile de texture
    for (const [f, rk, vv, ao] of (lite ? [[0, 0.9, 0.98, 0.55], [0.75, 1.02, 0.25, 1.0]] : [[0, 0.9, 0.98, 0.55], [0.25, 0.97, 0.75, 0.85], [0.88, 1.06, 0.12, 1.05]])) {
      const t = (k + f) / rings;
      const base = 0.3 - t * 0.1;
      const flare = t < 0.08 ? (1 - t / 0.08) * 0.16 : 0;
      prof.push([t, (base + flare) * rk, k + 1 - vv, ao * (0.8 + 0.2 * Math.min(1, t * 4))]);
    }
  }
  prof.push([1.0, 0.19, rings + 0.1, 0.6]);
  prof.unshift([-0.04, 0.47, 0, 0.5]);   // (pied enterré)
  for (const [t, rad, vv, ao] of prof) {
    const c = at(t), d = tan(t);
    const a = Math.abs(d.y) < 0.95 ? v3(0, 1, 0) : v3(1, 0, 0);
    const s1 = a.clone().cross(d).normalize(), s2 = d.clone().cross(s1).normalize();
    const row = [];
    for (let i = 0; i <= sides; i++) {
      const ang = i / sides * TAU, cc = Math.cos(ang), ss = Math.sin(ang);
      const rr = rad * (1 + (noise3(cc * 1.5 + 3, t * 6, ss * 1.5 + seed) - 0.5) * 0.07);
      const nx = s1.x * cc + s2.x * ss, ny = s1.y * cc + s2.y * ss, nz = s1.z * cc + s2.z * ss;
      row.push(B.v(c.x + nx * rr, c.y + ny * rr, c.z + nz * rr, nx, ny, nz, i / sides * 2, vv, ao));
    }
    rows.push(row);
  }
  for (let j = 0; j < rows.length - 1; j++) for (let i = 0; i < sides; i++) B.quad(0, rows[j][i], rows[j + 1][i], rows[j][i + 1], rows[j + 1][i + 1]);
  const top = at(1);
  // --- collerette fibreuse sous la couronne (bases des palmes, sombres) ---
  {
    const m = new THREE.Matrix4();
    for (let i = 0; i < (lite ? 5 : 8); i++) {
      const a = i / (lite ? 5 : 8) * TAU + r() * 0.4;
      const g = new THREE.ConeGeometry(0.16, 0.9, 5, 1);
      g.translate(0, -0.45, 0);
      m.makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.45, 0, -Math.cos(a) * 0.45));
      m.setPosition(top.x + Math.cos(a) * 0.12, top.y + 0.2, top.z + Math.sin(a) * 0.12);
      B.add(0, g, m, (x, y) => [0.55, 0.45, 0.32], [0.4, 1.5]);
    }
  }
  // --- noix de coco ---
  {
    const n = 3 + ((r() * 2) | 0), m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = i / n * TAU + r() * 0.6, g = lumpySphere(0.19, 1, 0.08, 3, seed + i, 1.12);
      m.makeRotationFromEuler(new THREE.Euler(r(), r() * 6, r()));
      m.setPosition(top.x + Math.cos(a) * 0.27, top.y - 0.22 - r() * 0.12, top.z + Math.sin(a) * 0.27);
      const tone = 0.75 + r() * 0.25, green = r() < 0.35;
      B.add(0, g, m, (x, y, z, nx, ny) => { const k = (0.45 + 0.4 * (ny * 0.5 + 0.5)) * tone; return green ? [0.62 * k, 0.6 * k, 0.26 * k] : [0.5 * k, 0.33 * k, 0.2 * k]; }, [0.3, 0.3]);
    }
  }
  // --- palmes ---
  const nf = opts.fronds || (lite ? 9 : 13);
  const segs = lite ? 7 : 11, across = lite ? 3 : 5;
  const fronds = [];
  for (let i = 0; i < nf; i++) fronds.push({ a: i / nf * TAU + (r() - 0.5) * 0.35, el: 0.2 + r() * 0.55, L: (3.4 + r() * 1.2) * (H / 7.5 * 0.5 + 0.5), old: false });
  // quelques jeunes palmes dressées au cœur, et 2 vieilles qui pendent (jaunies)
  for (let i = 0; i < (lite ? 2 : 3); i++) fronds.push({ a: r() * TAU, el: 1.05 + r() * 0.25, L: 1.8 + r() * 0.6, old: false, young: true });
  if (!lite) for (let i = 0; i < 2; i++) fronds.push({ a: r() * TAU, el: -0.55 - r() * 0.3, L: 2.4 + r() * 0.5, old: true });
  for (const f of fronds) {
    const W = f.L * (f.young ? 0.24 : 0.34);
    const dir0 = v3(Math.cos(f.a) * Math.cos(f.el), Math.sin(f.el), Math.sin(f.a) * Math.cos(f.el));
    const side = v3(-Math.sin(f.a), 0, Math.cos(f.a));
    const droop = f.young ? 0.5 : f.old ? 0.4 : 1.6 + r() * 0.6;     // courbure vers le bas, le long de la palme
    const twist = (r() - 0.5) * 0.6;
    const pts = [], dirs = [];
    {
      const p = top.clone().addScaledVector(dir0, 0.12); p.y += 0.05;
      let d = dir0.clone();
      const ds = f.L / segs;
      for (let s = 0; s <= segs; s++) {
        pts.push(p.clone()); dirs.push(d.clone());
        // la palme se courbe vers le sol, de plus en plus
        const pitch = droop * ds / f.L * (0.5 + s / segs * 1.6);
        const axis = side.clone();
        d.applyAxisAngle(axis, -pitch).normalize();
        p.addScaledVector(d, ds);
      }
    }
    const ids = [];
    const hueR = r();
    for (let s = 0; s <= segs; s++) {
      const t = s / segs, P = pts[s], D = dirs[s];
      // largeur : étroite au départ (pétiole nu), large au milieu, pointue au bout
      const wt = t < 0.1 ? t / 0.1 * 0.25 : Math.pow(Math.sin(Math.min(1, (t - 0.02) / 0.98) * Math.PI), 0.65) * (1 - t * 0.25);
      const w = W * wt;
      const tw = twist * t;
      const sd = side.clone().applyAxisAngle(D, tw);
      const up = sd.clone().cross(D).normalize();     // normale « dessus »
      if (up.y < 0) up.negate();
      const row = [];
      for (let k = 0; k < across; k++) {
        const u = k / (across - 1), o = (u - 0.5) * 2;   // -1..1
        // pli en V renversé : les folioles retombent de part et d'autre de la nervure
        const fold = Math.abs(o) * w * (f.old ? 0.65 : 0.42) * (0.5 + t);
        const q = P.clone().addScaledVector(sd, o * w).addScaledVector(up, -fold);
        const nrm = up.clone().addScaledVector(sd, o * 0.55).normalize();
        // ombre : sombre près du cœur de la couronne et au bord replié ; vieilles palmes jaunies
        const ao = (0.55 + 0.45 * Math.min(1, t * 2.5)) * (1 - Math.abs(o) * 0.12);
        let col;
        if (f.old) col = [0.95 * ao, 0.78 * ao, 0.42 * ao];
        else if (f.young) col = [0.92 * ao, 1.02 * ao, 0.7 * ao];
        else col = [(0.86 + hueR * 0.14) * ao, ao, (0.82 + hueR * 0.1) * ao];
        row.push(B.v(q.x, q.y, q.z, nrm.x, nrm.y, nrm.z, u, 1 - t, col));
      }
      ids.push(row);
    }
    B.grid(1, ids);
  }
  const [trunkGeo, frondGeo] = B.geometries();
  return { trunk: trunkGeo, fronds: frondGeo, top: [top.x, top.y, top.z] };
}

let palmMats = null;
/** Matières du palmier : { trunk, frond, depth }. Les palmes ondulent au vent (FOLIAGE.uTime). */
export function palmMaterials(lite) {
  const key = lite ? 'l' : 'h';
  if (palmMats && palmMats[key]) return palmMats[key];
  palmMats = palmMats || {};
  const bt = palmBarkTex();
  const trunk = new THREE.MeshStandardMaterial({ map: bt.map, normalMap: lite ? null : bt.normalMap, vertexColors: true, roughness: 0.95 });
  trunk.normalScale = new THREE.Vector2(1.2, 1.2);
  const ft = frondTex();
  const wind = (sh) => {
    sh.uniforms.uTime = FOLIAGE.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        // le bout des palmes (v petit) ondule ; la phase dépend de l'endroit
        float k = 1.0 - uv.y; k *= k;
        float ph = position.x * 0.21 + position.z * 0.17;
        transformed.y += sin(uTime * 1.7 + ph) * k * 0.16;
        transformed.x += sin(uTime * 1.1 + ph * 1.3) * k * 0.1;
        transformed.z += cos(uTime * 1.3 + ph) * k * 0.08;
      }`);
  };
  const frond = new THREE.MeshStandardMaterial({ map: ft, vertexColors: true, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.7 });
  frond.onBeforeCompile = (sh) => {
    wind(sh);
    // l'envers d'une palme reçoit la lumière comme l'endroit (un peu translucide) : pas de palmes noires
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.12;');
  };
  frond.customProgramCacheKey = () => 'palm-frond';
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: ft, alphaTest: 0.45 });
  depth.onBeforeCompile = wind;
  depth.customProgramCacheKey = () => 'palm-depth';
  return (palmMats[key] = { trunk, frond, depth });
}

// =============================================================================
// Feuillage plein (buissons) : texture de petites feuilles serrées, volumes cabossés
// =============================================================================
/** Feuilles serrées qui se chevauchent (couleur + relief). */
export function leafTex() {
  return once('leaf', () => RT.realTex(256, 256, 93, (x, y, w, h, R) => {
    x.fillStyle = '#2f5e24'; x.fillRect(0, 0, w, h);
    y.fillStyle = '#404040'; y.fillRect(0, 0, w, h);
    const pal = ['#4f8f34', '#5c9e3a', '#447f2e', '#68aa42', '#3c7428', '#76b44a', '#56963a'];
    for (let i = 0; i < 900; i++) {
      const px = R() * w, py = R() * h, L = 11 + R() * 9, W = L * (0.45 + R() * 0.15), a = R() * TAU;
      const c = pal[(R() * pal.length) | 0], hv = 110 + R() * 140 | 0;
      wrapDraw(w, h, px, py, 24, (X, Y) => {
        x.save(); x.translate(X, Y); x.rotate(a);
        // feuille : ovale pointu, plus claire d'un côté, nervure
        const g = x.createLinearGradient(0, -W / 2, 0, W / 2);
        g.addColorStop(0, c); g.addColorStop(1, '#2a5420');
        x.fillStyle = g;
        x.beginPath(); x.moveTo(-L / 2, 0); x.quadraticCurveTo(0, -W, L / 2, 0); x.quadraticCurveTo(0, W, -L / 2, 0); x.fill();
        x.strokeStyle = 'rgba(200,230,150,0.35)'; x.lineWidth = 0.8; x.beginPath(); x.moveTo(-L / 2, 0); x.lineTo(L / 2, 0); x.stroke();
        x.restore();
        y.save(); y.translate(X, Y); y.rotate(a);
        const gh = y.createRadialGradient(0, 0, 0, 0, 0, L / 2);
        gh.addColorStop(0, `rgb(${hv},${hv},${hv})`); gh.addColorStop(1, `rgb(${hv * 0.6 | 0},${hv * 0.6 | 0},${hv * 0.6 | 0})`);
        y.fillStyle = gh;
        y.beginPath(); y.moveTo(-L / 2, 0); y.quadraticCurveTo(0, -W, L / 2, 0); y.quadraticCurveTo(0, W, -L / 2, 0); y.fill();
        y.restore();
      });
    }
  }, { strength: 4 }));
}

/**
 * Volume de feuillage : des mottes cabossées (bruit à deux échelles = silhouette « en feuilles »)
 * soudées en une touffe ; ombre douce dans les creux entre les mottes et dessous.
 * lumps : [[x, y, z, r], …] ; rend une géométrie (uv sphériques par motte, couleur = ombre × teinte).
 */
export function foliageVolume(lumps, opts = {}) {
  const B = builder(1), lite = !!opts.lite, seed = opts.seed || 1;
  const tint = opts.tint || [1, 1, 1];
  const m = new THREE.Matrix4();
  lumps.forEach(([cx, cy, cz, rr], li) => {
    const g = lumpySphere(1, lite ? 2 : 3, 0, 1, 0);
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      // grosses bosses + petites « feuilles »
      const n1 = noise3(x * 1.6 + li * 3.1 + seed, y * 1.6, z * 1.6 - li);
      const n2 = noise3(x * 5.5 + li, y * 5.5 + seed, z * 5.5);
      const k = rr * (1 + (n1 - 0.5) * 0.32 + (n2 - 0.5) * 0.16) * (y < -0.35 ? 0.9 + (y + 1) * 0.15 : 1);
      p.setXYZ(i, x * k, y * k * (opts.squash || 0.9), z * k);
    }
    g.computeVertexNormals();
    m.makeTranslation(cx, cy, cz);
    B.add(0, g, m, (X, Y, Z, nx, ny) => aoAt(X, Y, Z, ny, li));
  });
  // ombre : dessous, creux entre mottes (proche d'une autre motte), bas de la touffe
  function aoAt(X, Y, Z, ny, li) {
    let ao = 0.62 + 0.38 * clamp(ny * 0.5 + 0.55, 0, 1);
    for (let j = 0; j < lumps.length; j++) {
      if (j === li) continue;
      const L = lumps[j], d = Math.hypot(X - L[0], Y - L[1], Z - L[2]) / L[3];
      if (d < 1.35) ao *= 0.62 + 0.38 * clamp((d - 0.85) / 0.5, 0, 1);
    }
    ao *= clamp(0.55 + (Y + 0.1) * 0.5, 0.55, 1);
    return [ao * tint[0], ao * tint[1], ao * tint[2]];
  }
  const body = boxUV(B.geometry().toNonIndexed(), opts.uvScale || 2.2);
  // petites feuilles pleines qui dépassent de la surface : la silhouette devient « feuillue »
  const nl = opts.leaves === undefined ? (lite ? 110 : 260) : opts.leaves;
  if (!nl) { body.computeBoundingSphere(); return body; }
  const L = builder(1), r = rng(seed * 101 + 5), bp = body.attributes.position, bn = body.attributes.normal;
  for (let i = 0; i < nl; i++) {
    // un point de la surface (au hasard parmi les sommets tournés vers l'extérieur et pas trop bas)
    let k = 0, tries = 0;
    do { k = (r() * bp.count) | 0; tries++; } while (tries < 20 && (bn.getY(k) < -0.25 || bp.getY(k) < 0.15));
    const P = v3(bp.getX(k), bp.getY(k), bp.getZ(k)), N = v3(bn.getX(k), bn.getY(k), bn.getZ(k)).normalize();
    const len = (opts.leafSize || 0.28) * (0.75 + r() * 0.5), wid = len * 0.6;
    // feuille « en écaille » : couchée sur la surface, pointe vers l'extérieur et un peu vers le bas
    const rnd = v3(r() - 0.5, -0.6 + (r() - 0.5) * 0.6, r() - 0.5);
    const dir = rnd.clone().addScaledVector(N, -rnd.dot(N)); if (dir.lengthSq() < 1e-4) dir.set(1, 0, 0);
    dir.normalize().addScaledVector(N, 0.45).normalize();
    const side = dir.clone().cross(N).normalize();
    const up = side.clone().cross(dir).normalize();
    const base = P.clone().addScaledVector(N, -0.02);
    const tip = base.clone().addScaledVector(dir, len).addScaledVector(up, -len * 0.12);
    const mid = base.clone().addScaledVector(dir, len * 0.45);
    const lft = mid.clone().addScaledVector(side, wid * 0.5).addScaledVector(up, -wid * 0.1), rgt = mid.clone().addScaledVector(side, -wid * 0.5).addScaledVector(up, -wid * 0.1);
    const ridge = mid.clone().addScaledVector(up, wid * 0.1);
    const ao = aoAt(P.x, P.y, P.z, N.y, -1).map(c => c * (1.08 + r() * 0.2));
    const u0 = r() * 4, w0 = r() * 4, s = len * 1.4;
    const ids = [base, lft, tip, rgt, ridge].map((q, j) => L.v(q.x, q.y, q.z, up.x * 0.4 + N.x * 0.6, up.y * 0.4 + N.y * 0.6, up.z * 0.4 + N.z * 0.6, u0 + [0, -0.5, 0, 0.5, 0][j] * s * 0.5, w0 + [0, 0.45, 1, 0.45, 0.45][j] * s, ao));
    L.tri(0, ids[0], ids[1], ids[4]); L.tri(0, ids[1], ids[2], ids[4]); L.tri(0, ids[2], ids[3], ids[4]); L.tri(0, ids[3], ids[0], ids[4]);
  }
  const out = concatGeos([body, L.geometry().toNonIndexed()]);
  out.userData.bodyCount = body.attributes.position.count;
  return out;
}

/** Coordonnées de texture « en boîte » par triangle (projection selon l'axe dominant de la face) : pas de couture en zigzag. */
export function boxUV(g, scale = 1) {
  const p = g.attributes.position, uv = g.attributes.uv, a = v3(0, 0, 0), b = v3(0, 0, 0), c = v3(0, 0, 0);
  for (let i = 0; i < p.count; i += 3) {
    a.set(p.getX(i), p.getY(i), p.getZ(i)); b.set(p.getX(i + 1), p.getY(i + 1), p.getZ(i + 1)); c.set(p.getX(i + 2), p.getY(i + 2), p.getZ(i + 2));
    const n = b.clone().sub(a).cross(c.clone().sub(a));
    const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
    for (let j = 0; j < 3; j++) {
      const x = p.getX(i + j), y = p.getY(i + j), z = p.getZ(i + j);
      if (ay >= ax && ay >= az) uv.setXY(i + j, x * scale, z * scale);
      else if (ax >= az) uv.setXY(i + j, z * scale, y * scale);
      else uv.setXY(i + j, x * scale, y * scale);
    }
  }
  uv.needsUpdate = true;
  return g;
}
/** Concatène des géométries non indexées (position, normale, uv, couleur). */
export function concatGeos(list) {
  const out = new THREE.BufferGeometry();
  for (const [k, n] of [['position', 3], ['normal', 3], ['uv', 2], ['color', 3]]) {
    let tot = 0; for (const g of list) tot += g.attributes.position.count;
    const arr = new Float32Array(tot * n); let o = 0;
    for (const g of list) { const at = g.attributes[k]; if (at) arr.set(at.array, o); else if (k === 'color') arr.fill(1, o, o + g.attributes.position.count * n); o += g.attributes.position.count * n; }
    out.setAttribute(k, new THREE.BufferAttribute(arr, n));
  }
  out.computeBoundingSphere(); out.computeBoundingBox();
  return out;
}

const leafMats = {};
/** Matière du feuillage plein ; frémit un peu au vent. */
export function leafMaterial(lite) {
  const key = lite ? 'l' : 'h';
  if (leafMats[key]) return leafMats[key];
  const t = leafTex();
  const mat = new THREE.MeshStandardMaterial({ map: t.map, normalMap: lite ? null : t.normalMap, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide });
  mat.normalScale = new THREE.Vector2(1.3, 1.3);
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = FOLIAGE.uTime;
    sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      {
        vec4 w0 = modelMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #ifdef USE_INSTANCING
          w0 = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        #endif
        float ph = w0.x * 0.37 + w0.z * 0.23;
        float k = max(transformed.y, 0.0) * 0.025;
        transformed.x += sin(uTime * 1.6 + ph + transformed.y * 2.0) * k;
        transformed.z += cos(uTime * 1.3 + ph) * k;
      }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * 0.06;');
  };
  mat.customProgramCacheKey = () => 'sc-leaf-' + key;
  return (leafMats[key] = mat);
}

/** Buisson à baies (pied en 0) : une touffe de 7-9 mottes, plus large que haute (~2 m × 1,4 m). */
export function berryBushGeometry(seed = 3, lite = false) {
  const r = rng(seed * 31 + 7), lumps = [[0, 0.62, 0, 0.72]];
  const n = lite ? 6 : 8;
  for (let i = 0; i < n; i++) {
    const a = i / n * TAU + r() * 0.5, d = 0.5 + r() * 0.18, rr = 0.42 + r() * 0.16;
    lumps.push([Math.cos(a) * d, 0.32 + r() * 0.3 + (i % 2) * 0.12, Math.sin(a) * d, rr]);
  }
  lumps.push([0.15, 1.0, -0.1, 0.42]);
  return foliageVolume(lumps, { lite, seed, tint: [0.95, 1.0, 0.92] });
}

/**
 * Grappe de baies (centrée en 0, ~0,3 m) : 4-5 baies cabossées (petits grains), queues et une
 * petite feuille ; la couleur d'instance teinte les baies (sommets clairs) bien plus que les queues.
 */
export function berryClusterGeometry(lite = false) {
  const B = builder(1), m = new THREE.Matrix4(), r = rng(17);
  const n = lite ? 5 : 8;
  for (let i = 0; i < n; i++) {
    // grappe serrée, en dôme
    const a = i * 2.4, d = i === 0 ? 0 : 0.06 + (i % 3) * 0.035, rr = 0.062 - (i % 4) * 0.006;
    const x = Math.cos(a) * d, z = Math.sin(a) * d, y = -d * 0.8 + (i === 0 ? 0.03 : 0);
    const g = lumpySphere(rr, 1, 0.06, 14, i * 3.7);
    m.makeTranslation(x, y, z);
    // blanc (teinté par l'instance) ; un petit œil sombre (calice) sur le dessus
    B.add(0, g, m, (X, Y, Z, nx, ny) => { const top = ny > 0.86 ? 0.3 : 1; const s = (0.78 + 0.22 * (ny * 0.5 + 0.5)) * top; return [s, s, s]; });
  }
  // queue commune et petits pédicelles, vert-brun (peu teintés : sombres)
  const st = new THREE.CylinderGeometry(0.006, 0.01, 0.08, 4); st.translate(0, 0.04, 0);
  m.makeRotationFromEuler(new THREE.Euler(0.3, 0, -0.25)); m.setPosition(0, 0.07, 0);
  B.add(0, st, m, [0.3, 0.4, 0.15]);
  void r;
  return B.geometry();
}

/**
 * Point de la surface d'une géométrie dans une direction donnée depuis un centre (le sommet le plus
 * éloigné dans un petit cône) : pour poser des baies, des fruits… juste sur le feuillage.
 */
export function surfacePoint(geo, center, dir, cone = 0.93) {
  const p = geo.attributes.position, d = dir.clone().normalize(), q = v3(0, 0, 0);
  let best = null, bestL = -1;
  const n = geo.userData.bodyCount || p.count;
  for (let i = 0; i < n; i++) {
    q.set(p.getX(i) - center.x, p.getY(i) - center.y, p.getZ(i) - center.z);
    const l = q.length(); if (l < 1e-4) continue;
    if (q.dot(d) / l < cone) continue;
    if (l > bestL) { bestL = l; best = i; }
  }
  if (best === null) return center.clone().addScaledVector(d, 1);
  return v3(p.getX(best), p.getY(best), p.getZ(best));
}

/** Boîte aux arêtes arrondies (planche, plateau, coussin carré…), normales douces. */
export function roundBox(w, h, d, rad, seg = 2) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2, seg * 2, seg * 2);
  const p = g.attributes.position, hx = w / 2 - rad, hy = h / 2 - rad, hz = d / 2 - rad, q = v3(0, 0, 0);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const cx = clamp(x, -hx, hx), cy = clamp(y, -hy, hy), cz = clamp(z, -hz, hz);
    q.set(x - cx, y - cy, z - cz);
    if (q.lengthSq() > 1e-9) q.normalize().multiplyScalar(rad);
    p.setXYZ(i, cx + q.x, cy + q.y, cz + q.z);
  }
  const m = mergeVerts(g);
  return m;
}

// =============================================================================
// Étal de marché : bois, toile rayée à festons, cagettes de fruits et légumes
// =============================================================================
/** Planches de bois (veinage, nœuds, joints sombres) — presque blanc-bois : la teinte vient des sommets. */
export function woodTex() {
  return once('wood', () => RT.realTex(256, 256, 57, (x, y, w, h, R) => {
    x.fillStyle = '#c8a072'; x.fillRect(0, 0, w, h);
    const planks = 4;
    for (let k = 0; k < planks; k++) {
      const x0 = k * w / planks, pw = w / planks;
      const base = 180 + R() * 40;
      x.fillStyle = `rgb(${base | 0},${base * 0.78 | 0},${base * 0.55 | 0})`; x.fillRect(x0, 0, pw, h);
      for (let i = 0; i < 60; i++) {
        const gx = x0 + R() * pw, c = R() < 0.5 ? 'rgba(110,70,40,0.25)' : 'rgba(240,210,170,0.2)';
        x.strokeStyle = c; x.lineWidth = 0.6 + R() * 1.4; x.beginPath(); x.moveTo(gx, 0);
        for (let yy = 0; yy <= h; yy += 16) x.lineTo(gx + Math.sin(yy * 0.05 + i) * 2.5, yy);
        x.stroke();
      }
      if (R() < 0.8) { const kx = x0 + pw * (0.3 + R() * 0.4), ky = R() * h; const g = x.createRadialGradient(kx, ky, 0, kx, ky, 7); g.addColorStop(0, 'rgba(70,40,20,0.8)'); g.addColorStop(1, 'rgba(70,40,20,0)'); x.fillStyle = g; x.beginPath(); x.ellipse(kx, ky, 5, 9, 0, 0, TAU); x.fill(); }
      // joint entre planches (creux)
      x.fillStyle = 'rgba(50,30,15,0.85)'; x.fillRect(x0, 0, 2, h);
      y.fillStyle = '#202020'; y.fillRect(x0, 0, 3, h);
      for (let i = 0; i < 40; i++) { const gx = x0 + R() * pw, v = 100 + R() * 80 | 0; y.strokeStyle = `rgba(${v},${v},${v},0.5)`; y.lineWidth = 1; y.beginPath(); y.moveTo(gx, 0); y.lineTo(gx + (R() - 0.5) * 4, h); y.stroke(); }
    }
  }, { strength: 3 }));
}
/** Toile rayée (couleur + crème), tissage visible. */
export function canvasStripeTex(hex, n = 8) {
  return once('stripe' + hex + '_' + n, () => {
    const c = new THREE.Color(hex), cs = '#' + c.getHexString();
    return RT.realTex(256, 64, 13, (x, y, w, h, R) => {
      for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? '#f6efdc' : cs; x.fillRect(i * w / n, 0, w / n + 1, h); }
      // tissage : fines lignes croisées, un peu de salissure
      for (let i = 0; i < w; i += 2) { x.fillStyle = `rgba(0,0,0,${0.04 + R() * 0.05})`; x.fillRect(i, 0, 1, h); y.fillStyle = 'rgba(160,160,160,0.6)'; y.fillRect(i, 0, 1, h); }
      for (let j = 0; j < h; j += 2) { x.fillStyle = `rgba(255,255,255,${0.03 + R() * 0.04})`; x.fillRect(0, j, w, 1); y.fillStyle = 'rgba(100,100,100,0.4)'; y.fillRect(0, j, w, 1); }
      for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(90,70,40,0.05)'; x.beginPath(); x.ellipse(R() * w, R() * h, 6 + R() * 14, 3 + R() * 6, 0, 0, TAU); x.fill(); }
    }, { strength: 1.5 });
  });
}

const stallMats = {};
function stallMaterials(hex, lite) {
  const k = hex + (lite ? 'l' : 'h');
  if (stallMats[k]) return stallMats[k];
  const wt = woodTex(), ft = canvasStripeTex(hex);
  const wood = stallMats.wood || (stallMats.wood = new THREE.MeshStandardMaterial({ map: wt.map, normalMap: lite ? null : wt.normalMap, vertexColors: true, roughness: 0.85 }));
  const cloth = new THREE.MeshStandardMaterial({ map: ft.map, normalMap: lite ? null : ft.normalMap, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const food = stallMats.food || (stallMats.food = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
  return (stallMats[k] = { wood, cloth, food });
}

/** Fruits et légumes (lumpy) dans une cagette de w × d posée en (x, y, z). */
function crateOfProduce(W, F, x, y, z, w, d, kind, r, lite) {
  const m = new THREE.Matrix4(), h = 0.26;
  // cagette : fond, 4 bords à claire-voie (deux lattes), coins
  const slat = (sx, sy, sz, px, py, pz, ry = 0) => { m.makeRotationY(ry); m.setPosition(px, py, pz); W.add(0, roundBox(sx, sy, sz, 0.012, 1), m, (X, Y, Z, nx, ny) => 0.75 + 0.25 * (ny * 0.5 + 0.5), [1.4, 1.4]); };
  slat(w, 0.03, d, x, y + 0.015, z);
  for (const s of [-1, 1]) for (const yy of [0.07, 0.19]) { slat(w, 0.07, 0.025, x, y + yy, z + s * (d / 2 - 0.012)); slat(0.025, 0.07, d, x + s * (w / 2 - 0.012), y + yy, z); }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) slat(0.045, h, 0.045, x + sx * (w / 2 - 0.022), y + h / 2, z + sz * (d / 2 - 0.022));
  // tas de fruits en dôme
  const K = {
    apple: { r: 0.075, col: [[0.85, 0.12, 0.1], [0.75, 0.15, 0.08], [0.95, 0.75, 0.2]], sq: 0.9, amt: 0.05 },
    orange: { r: 0.075, col: [[1.0, 0.55, 0.08], [0.98, 0.48, 0.05]], sq: 1, amt: 0.03, pits: true },
    lemon: { r: 0.06, col: [[1.0, 0.88, 0.2], [0.95, 0.82, 0.15]], sq: 1, amt: 0.04, stretch: 1.35 },
    cabbage: { r: 0.1, col: [[0.45, 0.72, 0.28], [0.55, 0.8, 0.35]], sq: 0.85, amt: 0.14 },
    grape: { r: 0.045, col: [[0.45, 0.2, 0.55], [0.38, 0.15, 0.48]], sq: 1, amt: 0.03 },
    tomato: { r: 0.07, col: [[0.92, 0.18, 0.1], [0.85, 0.12, 0.08]], sq: 0.8, amt: 0.06 },
  }[kind];
  const nx = Math.max(2, Math.floor((w - 0.06) / (K.r * 2))), nz = Math.max(2, Math.floor((d - 0.06) / (K.r * 2)));
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i < nx - layer; i++) for (let j = 0; j < nz - layer; j++) {
    if (layer && r() < 0.25) continue;
    const fx = x - (w - 0.06) / 2 + K.r + (i + layer * 0.5) * (w - 0.06 - K.r * 2) / Math.max(1, nx - 1) + (r() - 0.5) * 0.02;
    const fz = z - (d - 0.06) / 2 + K.r + (j + layer * 0.5) * (d - 0.06 - K.r * 2) / Math.max(1, nz - 1) + (r() - 0.5) * 0.02;
    const fy = y + 0.05 + K.r * (0.9 + layer * 1.5);
    const g = lumpySphere(K.r * (0.9 + r() * 0.2), lite ? 1 : 2, K.amt, kind === 'cabbage' ? 6 : 3, r() * 50, K.sq);
    if (K.stretch) g.scale(K.stretch, 1, 1);
    m.makeRotationFromEuler(new THREE.Euler(r() * 0.5, r() * 6.28, r() * 0.5)); m.setPosition(fx, fy, fz);
    const col = K.col[(r() * K.col.length) | 0];
    F.add(0, g, m, (X, Y, Z, nx2, ny) => { const s = 0.6 + 0.4 * (ny * 0.5 + 0.5); return [col[0] * s, col[1] * s, col[2] * s]; });
    if (kind === 'apple' || kind === 'tomato') { const st = new THREE.CylinderGeometry(0.006, 0.008, 0.04, 4); m.makeTranslation(fx, fy + K.r * 0.9, fz); F.add(0, st, m, [0.25, 0.18, 0.08]); }
  }
}

/**
 * Étal de marché complet (repère local : sol en y = 0, centre en 0) : comptoir en planches avec
 * plateau qui déborde, quatre poteaux tournés, auvent de toile rayée bombé, à festons qui pendent,
 * cagettes de fruits. s = { w, d, top, canopy, color } (hauteurs relatives au sol).
 * Rend un groupe de 3 maillages (bois, toile, fruits).
 */
export function marketStall(s, opts = {}) {
  const lite = !!opts.lite, r = rng((opts.seed || 1) * 131 + 9);
  const W = builder(1), C = builder(1), F = builder(1), m = new THREE.Matrix4();
  const top = s.top, can = s.canopy, w = s.w, d = s.d;
  const woodAO = (X, Y, Z, nx, ny) => { const k = (0.62 + 0.38 * clamp(Y / top, 0, 1)) * (0.85 + 0.15 * (ny * 0.5 + 0.5)); return [k, k * 0.97, k * 0.94]; };
  // comptoir : caisson en planches (devant et côtés), plateau épais qui déborde, plinthe
  m.makeTranslation(0, (top - 0.08) / 2, 0); W.add(0, roundBox(w - 0.1, top - 0.08, d - 0.1, 0.03, 1), m, woodAO);
  m.makeTranslation(0, top - 0.04, 0); W.add(0, roundBox(w + 0.12, 0.08, d + 0.12, 0.03, 1), m, woodAO);
  m.makeTranslation(0, 0.06, 0); W.add(0, roundBox(w - 0.02, 0.12, d - 0.02, 0.02, 1), m, (X, Y, Z) => [0.5, 0.45, 0.4]);
  // lattes verticales sur le devant (relief)
  const nSl = Math.round(w / 0.32);
  for (let i = 0; i < nSl; i++) for (const sz of [-1, 1]) { m.makeTranslation(-w / 2 + 0.16 + i * (w - 0.32) / Math.max(1, nSl - 1), top * 0.48, sz * (d / 2 - 0.03)); W.add(0, roundBox(0.26, top * 0.8, 0.03, 0.012, 1), m, woodAO); }
  // poteaux tournés
  const postProf = [[0.07, 0], [0.07, 0.08], [0.05, 0.14], [0.045, can - 0.25], [0.06, can - 0.2], [0.04, can - 0.12], [0.04, can]];
  const post = new THREE.LatheGeometry(postProf.map(([a, b]) => new THREE.Vector2(a, b)), lite ? 6 : 8);
  for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { m.makeTranslation(px * (w / 2 - 0.08), 0, pz * (d / 2 - 0.08)); W.add(0, post, m, (X, Y) => { const k = 0.6 + 0.3 * clamp(Y / can, 0, 1); return [k * 0.8, k * 0.68, k * 0.55]; }, [3, 1]); }
  // cagettes de fruits sur le plateau (2 ou 3 selon la largeur), légèrement inclinées vers le client
  const kinds = ['apple', 'orange', 'cabbage', 'lemon', 'tomato', 'grape'];
  const nc = w > 3.2 ? 3 : 2, cw = (w - 0.3) / nc - 0.06;
  if (opts.crates !== false) for (let i = 0; i < nc; i++) crateOfProduce(W, F, -w / 2 + 0.15 + cw / 2 + i * (cw + 0.06), top, -0.05, cw, Math.min(0.9, d - 0.5), kinds[((opts.seed || 1) * 2 + i) % kinds.length], r, lite);
  // auvent : toile bombée (sur un cadre), plus festons qui pendent tout autour
  const cw2 = w + 0.6, cd2 = d + 0.8, nu = lite ? 8 : 14, nv = lite ? 6 : 10;
  const ids = [];
  const roofY = (u, v) => can - 0.12 + 0.2 * Math.sin(u * Math.PI) * 0.4 + 0.22 * Math.sin(v * Math.PI) - 0.05 * (Math.sin(u * Math.PI * 2 * 2) ** 2) * Math.sin(v * Math.PI);
  for (let j = 0; j <= nv; j++) {
    const row = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, x = (u - 0.5) * cw2, z = (v - 0.5) * cd2, y = roofY(u, v);
      const dy = (roofY(Math.min(1, u + 0.02), v) - roofY(Math.max(0, u - 0.02), v)) / (0.04 * cw2), dz = (roofY(u, Math.min(1, v + 0.02)) - roofY(u, Math.max(0, v - 0.02))) / (0.04 * cd2);
      row.push(C.v(x, y, z, -dy, 1, -dz, u * 2.5, v * 0.6, 0.92 + 0.08 * Math.sin(v * Math.PI)));
    }
    ids.push(row);
  }
  C.grid(0, ids);
  // festons : bande qui pend du bord, bas découpé en arcs
  const per = [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]];
  for (const [ax, az, bx, bz] of per) {
    const L = Math.hypot((bx - ax) * cw2 / 2, (bz - az) * cd2 / 2), nS = Math.max(3, Math.round(L / 0.45)), per1 = lite ? 3 : 6, n = nS * per1;
    const topRow = [], botRow = [];
    const nxv = az === bz ? 0 : ax, nzv = az === bz ? az : 0;
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = (ax + (bx - ax) * t) * cw2 / 2 * 1.002, z = (az + (bz - az) * t) * cd2 / 2 * 1.002;
      const u = (x / cw2 + 0.5), v = (z / cd2 + 0.5);
      const y0 = roofY(clamp(u, 0, 1), clamp(v, 0, 1));
      const arc = Math.sqrt(Math.abs(Math.sin(t * nS * Math.PI)));   // festons arrondis
      const drop = 0.2 + 0.15 * arc;
      const uu = az === bz ? u * 2.5 : v * 2.5 * cd2 / cw2;
      topRow.push(C.v(x, y0 + 0.01, z, nxv, 0, nzv, uu, 0, 1.0));
      botRow.push(C.v(x, y0 - drop, z, nxv, 0, nzv, uu, 0.55, 0.78));
    }
    C.grid(0, [topRow, botRow]);
  }
  const M = stallMaterials(s.color, lite);
  const g = new THREE.Group();
  const add = (B, mat) => { const geo = B.geometry(); const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = true; mesh.receiveShadow = true; g.add(mesh); return mesh; };
  // bois : coordonnées de texture « en boîte » (veinage vertical sur les faces, planches sur le plateau)
  const wg = W.geometry().toNonIndexed(); boxUV(wg, 1.1);
  const wm = new THREE.Mesh(wg, M.wood); wm.castShadow = wm.receiveShadow = true; g.add(wm);
  add(C, M.cloth).userData.noOutline = true;
  if (F.n) add(F, M.food);
  return g;
}

/**
 * Store de boutique (repère : x le long de la façade, +z vers la rue, y = 0 au niveau du dessus) :
 * toile rayée tendue en pente douce, qui se creuse un peu entre les bras, lambrequin à festons
 * devant et joues triangulaires sur les côtés ; deux bras de fer forgé et une barre au mur.
 * Rend un groupe (toile + fer).
 */
export function shopAwning(len, depth, color, opts = {}) {
  const lite = !!opts.lite, C = builder(1), I = builder(1), m = new THREE.Matrix4();
  const nu = lite ? 10 : 18, nv = lite ? 4 : 6, hiY = 0.16, loY = -0.14;
  const yAt = (u, v) => hiY + (loY - hiY) * v - 0.06 * Math.sin(v * Math.PI) * (0.6 + 0.4 * Math.sin(u * Math.PI)) - 0.035 * (Math.sin(u * Math.PI * 3) ** 2) * v;
  const rows = [];
  for (let j = 0; j <= nv; j++) {
    const row = [];
    for (let i = 0; i <= nu; i++) {
      const u = i / nu, v = j / nv, x = (u - 0.5) * len, z = (v - 0.5) * depth, y = yAt(u, v);
      const dz = (yAt(u, Math.min(1, v + 0.05)) - yAt(u, Math.max(0, v - 0.05))) / (0.1 * depth);
      row.push(C.v(x, y, z, 0, 1, -dz, u * len / 0.9, v * 0.7, 0.8 + 0.2 * (1 - v * 0.5)));
    }
    rows.push(row);
  }
  C.grid(0, rows);
  // lambrequin à festons (devant)
  {
    const nS = Math.max(4, Math.round(len / 0.45)), n = nS * (lite ? 3 : 6), top = [], bot = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = (t - 0.5) * len, y0 = yAt(t, 1), arc = Math.sqrt(Math.abs(Math.sin(t * nS * Math.PI)));
      top.push(C.v(x, y0 + 0.005, depth / 2 + 0.005, 0, 0, 1, t * len / 0.9, 0.0, 1));
      bot.push(C.v(x, y0 - 0.2 - 0.12 * arc, depth / 2 + 0.005, 0, 0.1, 1, t * len / 0.9, 0.5, 0.82));
    }
    C.grid(0, [top, bot]);
  }
  // joues (côtés) : triangle de toile
  for (const sx of [-1, 1]) {
    const a = C.v(sx * len / 2, hiY, -depth / 2, sx, 0, 0, 0, 0, 0.85), b = C.v(sx * len / 2, yAt(sx > 0 ? 1 : 0, 1), depth / 2, sx, 0, 0, depth / 0.9, 0, 0.85), c = C.v(sx * len / 2, yAt(sx > 0 ? 1 : 0, 1) - 0.2, depth / 2, sx, 0, 0, depth / 0.9, 0.5, 0.7);
    C.tri(0, a, b, c);
  }
  // fer forgé : barre au mur, deux bras en pente, petites volutes
  const iron = (X, Y, Z) => [0.18, 0.18, 0.2];
  const bar = new THREE.CylinderGeometry(0.03, 0.03, len, 6); bar.rotateZ(Math.PI / 2);
  m.makeTranslation(0, hiY + 0.02, -depth / 2); I.add(0, bar, m, iron);
  for (const sx of [-1, 1]) {
    const L = Math.hypot(depth, 0.4), arm = new THREE.CylinderGeometry(0.022, 0.022, L, 5);
    m.makeRotationX(Math.atan2(depth, 0.4)); m.setPosition(sx * (len / 2 - 0.1), loY - 0.2 - 0.02, 0); I.add(0, arm, m, iron);
    const curl = new THREE.TorusGeometry(0.09, 0.016, 4, 10, Math.PI * 1.5); curl.rotateY(Math.PI / 2);
    m.makeTranslation(sx * (len / 2 - 0.1), loY - 0.3, -depth / 2 + 0.1); I.add(0, curl, m, iron);
  }
  const M = stallMaterials(color, lite);
  const metal = stallMats.iron || (stallMats.iron = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.6 }));
  const g = new THREE.Group();
  const cl = new THREE.Mesh(C.geometry(), M.cloth); cl.castShadow = cl.receiveShadow = true; cl.userData.noOutline = true;
  const ir = new THREE.Mesh(I.geometry(), metal); ir.castShadow = true;
  g.add(cl, ir);
  return g;
}

/** Rendu allégé (téléphone) : même règle que le moteur (classe « touch »). */
export const touchLite = () => typeof document !== 'undefined' && document.documentElement.classList.contains('touch');

// =============================================================================
// Château des chats : pelotes de laine, poufs capitonnés, griffoirs en sisal
// =============================================================================
/** Laine enroulée : faisceaux de brins parallèles qui se croisent, torsion des fils (presque blanche : teintée ensuite). */
export function yarnTex() {
  return once('yarn', () => RT.realTex(256, 256, 29, (x, y, w, h, R) => {
    x.fillStyle = '#e8e4e0'; x.fillRect(0, 0, w, h);
    y.fillStyle = '#606060'; y.fillRect(0, 0, w, h);
    // faisceaux : bandes de brins, chacune dans une direction
    for (let b = 0; b < 26; b++) {
      const a = R() * Math.PI, cx = R() * w, cy = R() * h, len = 120 + R() * 140, nS = 5 + (R() * 4 | 0);
      const dx = Math.cos(a), dy = Math.sin(a), px = -dy, py = dx;
      for (let s = 0; s < nS; s++) {
        const off = (s - nS / 2) * 5.5, hv = 150 + R() * 90 | 0, sh = 215 + R() * 40 | 0;
        wrapDraw(w, h, cx, cy, 200, (X, Y) => {
          const x0 = X + px * off - dx * len / 2, y0 = Y + py * off - dy * len / 2;
          x.strokeStyle = `rgb(${sh},${sh - 4},${sh - 8})`; x.lineWidth = 4.5; x.lineCap = 'round';
          x.beginPath(); x.moveTo(x0, y0); x.lineTo(x0 + dx * len, y0 + dy * len); x.stroke();
          x.strokeStyle = 'rgba(120,110,100,0.35)'; x.lineWidth = 1;
          // torsion du fil : petits traits obliques
          for (let t = 0; t < len; t += 4) { const qx = x0 + dx * t, qy = y0 + dy * t; x.beginPath(); x.moveTo(qx + px * 2, qy + py * 2); x.lineTo(qx - px * 2 + dx * 3, qy - py * 2 + dy * 3); x.stroke(); }
          y.strokeStyle = `rgb(${hv},${hv},${hv})`; y.lineWidth = 4; y.lineCap = 'round';
          y.beginPath(); y.moveTo(x0, y0); y.lineTo(x0 + dx * len, y0 + dy * len); y.stroke();
        });
      }
    }
  }, { strength: 5 }));
}
/** Velours (poufs, coussins) : tissage très fin, reflets doux et moirés. */
export function velvetTex() {
  return once('velvet', () => RT.realTex(256, 256, 31, (x, y, w, h, R) => {
    x.fillStyle = '#efefef'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 30); const v = R() < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)'; g.addColorStop(0, v); g.addColorStop(1, 'rgba(0,0,0,0)'); wrapDraw(w, h, R() * w, R() * h, 40, (X, Y) => { x.save(); x.translate(X, Y); x.scale(1, 0.5 + R()); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 30, 0, TAU); x.fill(); x.restore(); }); }
    for (let j = 0; j < h; j += 2) { x.fillStyle = `rgba(0,0,0,${0.03 + R() * 0.03})`; x.fillRect(0, j, w, 1); y.fillStyle = 'rgba(150,150,150,0.5)'; y.fillRect(0, j, w, 1); }
    for (let i = 0; i < w; i += 2) { x.fillStyle = `rgba(255,255,255,${0.03 + R() * 0.03})`; x.fillRect(i, 0, 1, h); y.fillStyle = 'rgba(110,110,110,0.4)'; y.fillRect(i, 0, 1, h); }
  }, { strength: 1.2 }));
}
/** Corde de sisal enroulée (une spire par tuile en v) : fibres claires, creux sombres entre les spires. */
export function sisalTex() {
  return once('sisal', () => RT.realTex(256, 64, 37, (x, y, w, h, R) => {
    // spire : une bande diagonale qui se raccorde (u : tour complet, v : une spire)
    const gr = x.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#7a6440'); gr.addColorStop(0.18, '#d8c290'); gr.addColorStop(0.5, '#e8d6a8'); gr.addColorStop(0.82, '#c8ae78'); gr.addColorStop(1, '#6a5434');
    x.fillStyle = gr; x.fillRect(0, 0, w, h);
    const hg = y.createLinearGradient(0, 0, 0, h);
    hg.addColorStop(0, '#202020'); hg.addColorStop(0.5, '#e0e0e0'); hg.addColorStop(1, '#202020');
    y.fillStyle = hg; y.fillRect(0, 0, w, h);
    // torons (torsion de la corde) et fibres qui dépassent
    for (let i = 0; i < w; i += 7) { x.strokeStyle = 'rgba(90,70,40,0.4)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(i, 4); x.lineTo(i + 10, h - 4); x.stroke(); y.strokeStyle = 'rgba(60,60,60,0.5)'; y.lineWidth = 1.5; y.beginPath(); y.moveTo(i, 4); y.lineTo(i + 10, h - 4); y.stroke(); }
    for (let i = 0; i < 260; i++) { const px = R() * w, py = R() * h, L = 4 + R() * 9, a = (R() - 0.5) * 1.2; x.strokeStyle = R() < 0.6 ? 'rgba(245,232,200,0.6)' : 'rgba(110,90,60,0.4)'; x.lineWidth = 0.7; x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * L, py + Math.sin(a) * L); x.stroke(); }
  }, { strength: 4 }));
}
const castleMats = {};
const texMat = (key, t, lite, o) => castleMats[key + (lite ? 'l' : 'h')] || (castleMats[key + (lite ? 'l' : 'h')] = Object.assign(new THREE.MeshStandardMaterial(Object.assign({ map: t.map, normalMap: lite ? null : t.normalMap, vertexColors: true, roughness: 1 }, o || {})), {}));
export const yarnMaterial = (lite = touchLite()) => texMat('yarn', yarnTex(), lite, { roughness: 1 });
export const velvetMaterial = (lite = touchLite()) => texMat('velvet', velvetTex(), lite, { roughness: 0.78 });
export const sisalMaterial = (lite = touchLite()) => texMat('sisal', sisalTex(), lite, { roughness: 1 });

/**
 * Pelote de laine (rayon r, centrée en 0) : boule de laine enroulée + des faisceaux de brins en
 * relief qui la ceinturent dans tous les sens (vraie silhouette de pelote), un bout de fil qui pend.
 * Couleur des sommets claire (teintée par la matière ou l'instance), creux plus sombres.
 */
export function yarnBallGeometry(r = 1, opts = {}) {
  const lite = opts.lite === undefined ? touchLite() : opts.lite, B = builder(1), rnd = rng((opts.seed || 1) * 71 + 3), m = new THREE.Matrix4();
  const core = new THREE.SphereGeometry(r * 0.955, lite ? 16 : 22, lite ? 10 : 14);
  B.add(0, core, null, (X, Y, Z, nx, ny) => { const k = 0.7 + 0.15 * (ny * 0.5 + 0.5); return [k, k, k]; }, [3, 2]);
  const bands = lite ? 5 : 7, strands = 2, segs = lite ? 24 : 32, sides = 3, tr = r * 0.045;
  for (let b = 0; b < bands; b++) {
    // un grand cercle d'axe quelconque
    const ax = v3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize(), e1 = ax.clone().cross(Math.abs(ax.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0)).normalize(), e2 = ax.clone().cross(e1);
    for (let s = 0; s < strands; s++) {
      const off = (s - (strands - 1) / 2) * tr * 2.1, rr = Math.sqrt(Math.max(0, r * r - off * off));
      const rows = [];
      for (let i = 0; i <= segs; i++) {
        const a = i / segs * TAU, c = Math.cos(a), sn = Math.sin(a);
        const P = e1.clone().multiplyScalar(c * rr).addScaledVector(e2, sn * rr).addScaledVector(ax, off);
        const T = e1.clone().multiplyScalar(-sn).addScaledVector(e2, c).normalize();
        const N0 = P.clone().normalize(), Bn = T.clone().cross(N0).normalize();
        const row = [];
        for (let k = 0; k <= sides; k++) {
          const q = k / sides * TAU, nrm = N0.clone().multiplyScalar(Math.cos(q)).addScaledVector(Bn, Math.sin(q));
          const p = P.clone().addScaledVector(nrm, tr * (Math.cos(q) > -0.2 ? 1 : 0.3));
          const sh = 0.86 + 0.14 * Math.cos(q);
          row.push(B.v(p.x, p.y, p.z, nrm.x, nrm.y, nrm.z, i / segs * 6, k / sides * 0.2 + s * 0.3, [sh, sh, sh]));
        }
        rows.push(row);
      }
      B.grid(0, rows);
    }
  }
  // bout de fil qui pend et traîne au sol
  if (opts.tail !== false) {
    const pts = [v3(r * 0.7, -r * 0.1, r * 0.68), v3(r * 1.0, -r * 0.55, r * 0.6), v3(r * 1.25, -r * 0.92, r * 0.5), v3(r * 1.9, -r * 0.98, r * 0.3)];
    const curve = new THREE.CatmullRomCurve3(pts), tube = new THREE.TubeGeometry(curve, lite ? 8 : 14, tr * 0.9, sides, false);
    B.add(0, tube, null, [0.85, 0.85, 0.85], [6, 0.2]);
  }
  void m;
  return B.geometry();
}

/**
 * Pouf capitonné (rayon R, hauteur H, pied en 0) : tambour bombé, boutons enfoncés sur le dessus
 * (le tissu se creuse et plisse autour), passepoil au bord, plis sur le flanc, socle sombre.
 * Couleurs : tissu blanc (teinté par l'instance) ; passepoil et boutons crème.
 */
export function poufGeometry(R = 1.3, H = 0.62, opts = {}) {
  const lite = opts.lite === undefined ? touchLite() : opts.lite, B = builder(1), m = new THREE.Matrix4();
  const nA = lite ? 28 : 40, nR = lite ? 10 : 18;
  // boutons : un au centre, un anneau de 6 (et 12 plus loin, si grand)
  const btn = [[0, 0]];
  for (let i = 0; i < 6; i++) btn.push([Math.cos(i / 6 * TAU) * R * 0.5, Math.sin(i / 6 * TAU) * R * 0.5]);
  if (!lite && R > 1.0) for (let i = 0; i < 12; i++) btn.push([Math.cos((i + 0.5) / 12 * TAU) * R * 0.84, Math.sin((i + 0.5) / 12 * TAU) * R * 0.84]);
  const dent = (x, z) => { let d = 0; for (const [bx, bz] of btn) { const q = ((x - bx) ** 2 + (z - bz) ** 2) / (R * R * 0.03); d = Math.max(d, Math.exp(-q)); } return d; };
  // profil : (rayon relatif, y) du bas vers le centre du dessus
  const prof = [];
  for (let k = 0; k <= nR; k++) {
    const t = k / nR;   // 0 : bas du flanc → 1 : centre du dessus
    if (t < 0.35) { const a = t / 0.35 * Math.PI / 2; prof.push([0.9 + 0.1 * Math.sin(a * 1.6 + 0.3), H * 0.08 + (H * 0.78) * Math.sin(a) ** 1.2, 'side']); }
    else { const u = (t - 0.35) / 0.65; prof.push([(1 - u) * 0.97, H * 0.86 + H * 0.2 * Math.sin(u * Math.PI / 2), 'top']); }
  }
  const rows = [];
  for (let k = 0; k < prof.length; k++) {
    const [rk, y, part] = prof[k], row = [];
    for (let i = 0; i <= nA; i++) {
      const a = i / nA * TAU, c = Math.cos(a), s = Math.sin(a);
      let rr = rk * R, yy = y;
      if (part === 'side') rr *= 1 + 0.02 * Math.sin(a * 18);                 // plis du flanc
      const x = c * rr, z = s * rr;
      if (part === 'top') yy -= dent(x, z) * H * 0.3 * clamp((1 - rk) * 6, 0, 1);                         // capitons
      const d = part === 'top' ? dent(x, z) : 0;
      const sh = (0.78 + 0.22 * (part === 'top' ? 1 - d * 0.6 : clamp(y / H, 0, 1))) * (part === 'side' ? 0.92 + 0.08 * Math.sin(a * 18) : 1);
      row.push(B.v(x, yy, z, c, 0.4, s, a / TAU * R * 4, y / H * 0.8 + rk, [sh, sh, sh]));
    }
    rows.push(row);
  }
  B.grid(0, rows);
  const geo0 = B.geometry({ normals: true });
  const out = builder(1);
  out.add(0, geo0, null, (X, Y, Z, nx, ny, nz, i) => [geo0.attributes.color.getX(i), geo0.attributes.color.getY(i), geo0.attributes.color.getZ(i)]);
  // passepoil (bord du dessus) et socle
  const pip = new THREE.TorusGeometry(R * 0.985, R * 0.035, 5, nA); pip.rotateX(Math.PI / 2);
  m.makeTranslation(0, H * 0.86, 0); out.add(0, pip, m, [1.0, 0.95, 0.8], [8, 0.3]);
  const base = new THREE.CylinderGeometry(R * 0.86, R * 0.9, H * 0.1, nA / 2 | 0); m.makeTranslation(0, H * 0.05, 0); out.add(0, base, m, [0.35, 0.33, 0.32]);
  // boutons
  for (const [bx, bz] of btn) {
    const y = H * 0.86 + H * 0.2 * Math.sin(Math.min(1, (1 - Math.hypot(bx, bz) / R / 0.97)) * Math.PI / 2) - H * 0.3 * clamp((Math.hypot(bx, bz) < 1e-3 ? 1 : (1 - Math.hypot(bx, bz) / R)) * 6, 0, 1) + 0.015;
    const g = lumpySphere(R * 0.045, lite ? 0 : 1, 0.05, 6, bx + bz, 0.55); m.makeTranslation(bx, y, bz); out.add(0, g, m, [0.95, 0.8, 0.5]);
  }
  return out.geometry();
}

/**
 * Griffoir (pied en 0) : socle carré moquetté, poteau gainé de sisal (spires, liens en haut et en
 * bas), plateau rond moquetté, et un pompon au bout d'une ficelle : { sisal, carpet } (deux géométries).
 */
export function scratchPostParts(h, opts = {}) {
  const lite = opts.lite === undefined ? touchLite() : opts.lite, col = opts.color || 0xa86ad8, m = new THREE.Matrix4();
  const S = builder(1), V = builder(1);
  const cc = new THREE.Color(col), carpet = [cc.r, cc.g, cc.b];
  // poteau de sisal : u autour, v = une spire tous les 7 cm
  {
    const sides = lite ? 12 : 18, rows = Math.max(8, Math.round(h / (lite ? 0.25 : 0.12))), R0 = 0.55, ids = [];
    for (let j = 0; j <= rows; j++) {
      const y = 0.3 + (h - 0.65) * j / rows, row = [];
      for (let i = 0; i <= sides; i++) {
        const a = i / sides * TAU, c = Math.cos(a), s = Math.sin(a);
        const k = 0.66 + 0.34 * clamp((y - 0.3) / 1.2, 0, 1);
        row.push(S.v(c * R0, y, s * R0, c, 0, s, i / sides * 1, (y / 0.07) + i / sides, [k, k, k]));
      }
      ids.push(row);
    }
    S.grid(0, ids);
    // liens de corde (bourrelets) en haut et en bas
    for (const y of [0.33, h - 0.37]) { const t = new THREE.TorusGeometry(R0 + 0.02, 0.05, 5, sides); t.rotateX(Math.PI / 2); m.makeTranslation(0, y, 0); S.add(0, t, m, [0.7, 0.62, 0.5], [8, 0.4]); }
  }
  // moquette : socle carré arrondi, plateau rond bombé ; ficelle et pompon
  m.makeTranslation(0, 0.15, 0); V.add(0, roundBox(1.9, 0.3, 1.9, 0.1, lite ? 1 : 2), m, (X, Y, Z, nx, ny) => { const k = 0.72 + 0.28 * (ny * 0.5 + 0.5); return [carpet[0] * k, carpet[1] * k, carpet[2] * k]; });
  const top = new THREE.CylinderGeometry(0.95, 0.95, 0.3, lite ? 16 : 28, 1); const tp = top.attributes.position;
  for (let i = 0; i < tp.count; i++) if (tp.getY(i) > 0) tp.setY(i, tp.getY(i) + 0.04 * (1 - Math.hypot(tp.getX(i), tp.getZ(i)) / 0.95));
  const topM = mergeVerts(top); topM.computeVertexNormals();
  m.makeTranslation(0, h + 0.15, 0); V.add(0, topM, m, (X, Y, Z, nx, ny) => { const k = 0.75 + 0.25 * (ny * 0.5 + 0.5); return [carpet[0] * k, carpet[1] * k, carpet[2] * k]; }, [2, 2]);
  const rim = new THREE.TorusGeometry(0.95, 0.07, 5, lite ? 16 : 28); rim.rotateX(Math.PI / 2); m.makeTranslation(0, h + 0.02, 0);
  V.add(0, rim, m, (X, Y, Z, nx, ny) => [carpet[0] * 0.8, carpet[1] * 0.8, carpet[2] * 0.8], [6, 0.4]);
  const str = new THREE.CylinderGeometry(0.012, 0.012, 1.3, 4); m.makeTranslation(0.85, h - 0.55, 0); V.add(0, str, m, [0.95, 0.95, 0.92]);
  const pom = lumpySphere(0.21, lite ? 1 : 2, 0.22, 7, 3); m.makeTranslation(0.85, h - 1.3, 0); V.add(0, pom, m, [1.0, 0.42, 0.7]);
  return { sisal: S.geometry(), carpet: V.geometry() };
}
/** Le griffoir en un groupe (2 maillages : sisal, moquette). */
export function scratchPost(h, opts = {}) {
  const lite = opts.lite === undefined ? touchLite() : opts.lite, P = scratchPostParts(h, opts), g = new THREE.Group();
  const a = new THREE.Mesh(P.sisal, sisalMaterial(lite)), b = new THREE.Mesh(P.carpet, velvetMaterial(lite));
  for (const k of [a, b]) { k.castShadow = true; k.receiveShadow = true; g.add(k); }
  return g;
}
/** Copie d'une géométrie dont la couleur des sommets est multipliée par une teinte. */
export function tinted(geo, hex) {
  const g = geo.clone(), c = new THREE.Color(hex), a = g.attributes.color;
  for (let i = 0; i < a.count; i++) a.setXYZ(i, a.getX(i) * c.r, a.getY(i) * c.g, a.getZ(i) * c.b);
  return g;
}

/** Modèles « sculptés » pour la couche de vie (life.js : palette props.<sorte>.model). */
export const LIFE_PROPS = {
  poufHD() { return { geo: poufGeometry(1.3, 0.62), mat: velvetMaterial(), h: 0.62, r: 1.3 }; },
  yarnballHD() { return { geo: yarnBallGeometry(1, { tail: false }), mat: yarnMaterial(), h: 1, r: 1, shadow: true }; },
};

// =============================================================================
// Tente de toile (campement) : pans qui se creusent entre les mâts, ourlet à festons, porte
// relevée, mât et fanion, haubans et piquets. Tout s'ajoute à deux constructeurs partagés
// (toile, bois/corde) : toutes les tentes d'un camp = 2 appels de dessin.
// =============================================================================
export function addTent(Cl, Wd, x, y, z, rot, opts = {}) {
  const lite = !!opts.lite, R = opts.r || 2, H = opts.h || 2.6, N = 6, nu = lite ? 4 : 7, nv = lite ? 5 : 9;
  const rnd = rng((opts.seed || 1) * 37 + 1), m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot, 0));
  const P = (lx, ly, lz) => v3(lx, ly, lz).applyQuaternion(q).add(v3(x, y, z));
  const doorPanel = 0;   // le pan qui fait face à rot (porte)
  for (let k = 0; k < N; k++) {
    const a0 = (k - 0.5) / N * TAU, a1 = (k + 0.5) / N * TAU;
    const rows = [];
    for (let j = 0; j <= nv; j++) {
      const v = j / nv;                     // 0 : sommet → 1 : bas
      const row = [];
      for (let i = 0; i <= nu; i++) {
        const u = i / nu, a = a0 + (a1 - a0) * u;
        // creux entre les mâts (au milieu du pan), plus marqué en bas ; ourlet à festons
        const sag = Math.sin(u * Math.PI) * 0.16 * Math.pow(v, 0.8);
        const rr = R * Math.pow(v, 0.92) * (1 - sag) * Math.cos(Math.PI / N) / Math.cos(a - (a0 + a1) / 2);
        let yy = H * (1 - v) + (j === nv ? Math.sin(u * Math.PI) * 0.12 : 0);
        // la porte : le bas du pan est relevé (on voit l'intérieur sombre)
        let lift = 0;
        if (k === doorPanel && v > 0.55) { const d = Math.abs(u - 0.5) * 2; lift = Math.max(0, (v - 0.55) / 0.45) * (1 - d) * 0.9; }
        const lx = Math.sin(a) * rr * (1 - lift * 0.35), lz = Math.cos(a) * rr * (1 - lift * 0.35);
        yy += lift * 0.7;
        const p = P(lx, yy, lz);
        const nn = v3(Math.sin(a), 0.6, Math.cos(a)).applyQuaternion(q).normalize();
        const ao = (0.62 + 0.38 * (1 - v * 0.55)) * (1 - sag * 1.2);
        row.push(Cl.v(p.x, p.y, p.z, nn.x, nn.y, nn.z, (k + u) * 0.25, v * H * 0.6, [ao, ao, ao]));
      }
      rows.push(row);
    }
    Cl.grid(0, rows);
  }
  // intérieur sombre derrière la porte (un triangle d'ombre)
  {
    const a = P(0, H * 0.48, R * 0.15), b = P(-R * 0.42, 0.02, R * 0.55), c = P(R * 0.42, 0.02, R * 0.55), n = v3(0, 0, 1).applyQuaternion(q);
    const ia = Cl.v(a.x, a.y, a.z, n.x, n.y, n.z, 0.5, 0, [0.06, 0.04, 0.04]), ib = Cl.v(b.x, b.y, b.z, n.x, n.y, n.z, 0.4, 0.1, [0.06, 0.04, 0.04]), ic = Cl.v(c.x, c.y, c.z, n.x, n.y, n.z, 0.6, 0.1, [0.06, 0.04, 0.04]);
    Cl.tri(0, ia, ib, ic); Cl.tri(0, ia, ic, ib);
  }
  // mât qui dépasse, boule et fanion
  const woodC = (X, Y) => [0.55, 0.4, 0.26];
  const pole = new THREE.CylinderGeometry(0.035, 0.045, 0.7, 6); m.compose(P(0, H + 0.3, 0), q, v3(1, 1, 1)); Wd.add(0, pole, m, woodC);
  const knob = new THREE.SphereGeometry(0.08, 8, 6); m.compose(P(0, H + 0.68, 0), q, v3(1, 1, 1)); Wd.add(0, knob, m, [0.95, 0.75, 0.25]);
  const flag = new THREE.BufferGeometry();
  {
    const f0 = P(0, H + 0.62, 0), f1 = P(0, H + 0.38, 0), f2 = P(0.55, H + 0.52, 0.06);
    const fp = [f0, f1, f2], nn = v3(0, 0, 1).applyQuaternion(q);
    flag.setAttribute('position', new THREE.Float32BufferAttribute(fp.flatMap(p => [p.x, p.y, p.z]), 3));
    flag.setAttribute('normal', new THREE.Float32BufferAttribute([nn.x, nn.y, nn.z, nn.x, nn.y, nn.z, nn.x, nn.y, nn.z], 3));
    flag.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 0], 2));
    flag.setIndex([0, 1, 2, 0, 2, 1]);
    Wd.add(0, flag, null, opts.flag || [0.85, 0.15, 0.12]);
  }
  // haubans et piquets (aux 6 mâts du bord, sauf devant la porte)
  for (let k = 0; k < N; k++) {
    const a = (k + 0.5) / N * TAU; if (k === N - 1 || k === 0) continue;
    const top = P(Math.sin(a) * R * 0.98, 0.12, Math.cos(a) * R * 0.98), stake = P(Math.sin(a) * (R + 0.9), 0, Math.cos(a) * (R + 0.9));
    const top2 = P(Math.sin(a) * R * 0.55, H * 0.45, Math.cos(a) * R * 0.55);
    const d = stake.clone().sub(top2), L = d.length(), rope = new THREE.CylinderGeometry(0.012, 0.012, L, 3);
    m.compose(top2.clone().add(stake).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), d.normalize()), v3(1, 1, 1));
    Wd.add(0, rope, m, [0.8, 0.74, 0.6]);
    const st = new THREE.CylinderGeometry(0.03, 0.02, 0.35, 4); m.compose(stake.clone().add(v3(0, 0.1, 0)), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2 * Math.cos(a + rot), 0, -0.2 * Math.sin(a + rot))), v3(1, 1, 1));
    Wd.add(0, st, m, woodC);
    void top;
  }
  void rnd;
}
const tentMats = {};
/** Matières des tentes : { cloth (toile rayée, double face), wood (bois, corde, fanion : couleurs des sommets) }. */
export function tentMaterials(hex = 0xd83a3a, lite = false) {
  const k = hex + (lite ? 'l' : 'h');
  if (tentMats[k]) return tentMats[k];
  const ft = canvasStripeTex(hex, 8), wt = woodTex();
  const cloth = new THREE.MeshStandardMaterial({ map: ft.map, normalMap: lite ? null : ft.normalMap, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  const wood = new THREE.MeshStandardMaterial({ map: wt.map, vertexColors: true, roughness: 0.8, side: THREE.DoubleSide });
  return (tentMats[k] = { cloth, wood });
}

// =============================================================================
// Maison-champignon : pied crépi, chapeau charnu à pois en relief et lamelles dessous,
// porte ronde en planches, fenêtres rondes allumées. Toutes les maisons d'un village
// s'ajoutent à 4 constructeurs partagés (crépi, chapeau, bois, vitres) : 4 appels de dessin.
// =============================================================================
/** Crépi (pied des maisons-champignons) : grain, petites fissures, taches — presque blanc. */
export function stuccoTex() {
  return once('stucco', () => RT.realTex(256, 256, 61, (x, y, w, h, R) => {
    x.fillStyle = '#ece6dc'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 9000; i++) { const v = 200 + R() * 55 | 0, px = R() * w, py = R() * h, s = 1 + R() * 2.5; x.fillStyle = `rgba(${v},${v - 6},${v - 14},0.5)`; x.fillRect(px, py, s, s); const hv = 90 + R() * 120 | 0; y.fillStyle = `rgba(${hv},${hv},${hv},0.6)`; y.fillRect(px, py, s, s); }
    for (let i = 0; i < 26; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 40); g.addColorStop(0, 'rgba(150,130,100,0.12)'); g.addColorStop(1, 'rgba(150,130,100,0)'); wrapDraw(w, h, R() * w, R() * h, 45, (X, Y) => { x.save(); x.translate(X, Y); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 40, 0, TAU); x.fill(); x.restore(); }); }
    for (let i = 0; i < 7; i++) { let px = R() * w, py = R() * h; x.strokeStyle = 'rgba(110,95,80,0.35)'; y.strokeStyle = 'rgba(30,30,30,0.7)'; x.lineWidth = y.lineWidth = 1; x.beginPath(); y.beginPath(); x.moveTo(px, py); y.moveTo(px, py); for (let k = 0; k < 6; k++) { px += (R() - 0.5) * 22; py += R() * 16; x.lineTo(px, py); y.lineTo(px, py); } x.stroke(); y.stroke(); }
  }, { strength: 3 }));
}
/** Peau de chapeau de champignon : marbrures douces, fines mouchetures — presque blanc. */
export function capTex() {
  return once('cap', () => RT.realTex(256, 256, 67, (x, y, w, h, R) => {
    x.fillStyle = '#f4f0ec'; x.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { const g = x.createRadialGradient(0, 0, 0, 0, 0, 34); const dk = R() < 0.6; g.addColorStop(0, dk ? 'rgba(120,60,50,0.16)' : 'rgba(255,255,255,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); wrapDraw(w, h, R() * w, R() * h, 40, (X, Y) => { x.save(); x.translate(X, Y); x.scale(1, 0.6 + R() * 0.8); x.fillStyle = g; x.beginPath(); x.arc(0, 0, 34, 0, TAU); x.fill(); x.restore(); }); }
    for (let i = 0; i < 1400; i++) { const px = R() * w, py = R() * h; x.fillStyle = `rgba(90,40,30,${0.08 + R() * 0.1})`; x.fillRect(px, py, 1.5, 1.5); y.fillStyle = 'rgba(170,170,170,0.5)'; y.fillRect(px, py, 2, 2); }
  }, { strength: 1.5 }));
}

export function addMushHouse(Bs, h, opts = {}) {
  const lite = !!opts.lite, [P, Cp, Wd, Gl] = Bs, H = h.h, R = h.r, cr = h.capR, yaw = h.yaw || 0;
  const rnd = rng(Math.round(h.x * 13 + h.z * 7) >>> 0), m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, 0));
  const O = v3(h.x, h.y, h.z);
  const T = (lx, ly, lz) => v3(lx, ly, lz).applyQuaternion(q).add(O);
  const place = (g, B, col, uvS, lx, ly, lz, rx = 0, ry = 0, rz = 0) => { m.compose(T(lx, ly, lz), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz))), v3(1, 1, 1)); B.add(0, g, m, col, uvS); };
  const sides = lite ? 20 : 36;
  // pied : profil bombé, plus large en bas, crépi
  const rAt = (y) => R * (1.08 - (y + 0.6) / (H + 0.6) * 0.16 + 0.05 * Math.sin((y + 0.6) / (H + 0.6) * Math.PI));
  {
    const rows = [], ny = lite ? 6 : 10;
    for (let j = 0; j <= ny; j++) {
      const y = -0.6 + (H + 0.6) * j / ny, row = [];
      for (let i = 0; i <= sides; i++) {
        const a = i / sides * TAU, rr = rAt(y) * (1 + (noise3(Math.cos(a) * 2, y * 0.8, Math.sin(a) * 2) - 0.5) * 0.05);
        const p = T(Math.sin(a) * rr, y, Math.cos(a) * rr), n = v3(Math.sin(a), 0.08, Math.cos(a)).applyQuaternion(q);
        // ombre : bas sali, sous le chapeau
        const ao = (0.7 + 0.3 * clamp((y + 0.2) / 0.8, 0, 1)) * (1 - 0.35 * clamp((y - (H - 1.0)) / 1.0, 0, 1));
        row.push(P.v(p.x, p.y, p.z, n.x, n.y, n.z, a / TAU * R * 2.2, y * 0.35, [ao * 0.98, ao * 0.93, ao * 0.84]));
      }
      rows.push(row);
    }
    P.grid(0, rows);
  }
  // chapeau : dôme charnu, bord ondulé et un peu retombant, lamelles dessous
  const capCol = new THREE.Color(h.col);
  {
    const nr = lite ? 8 : 14, cs = lite ? 28 : 56, top = [], under = [];
    const rim = (a) => 1 + 0.045 * Math.sin(a * 5 + 1.3) + 0.03 * Math.sin(a * 11 + 0.4);
    // dôme charnu dont le bord s'enroule vers le bas
    const capY = (t) => H - 0.15 + cr * 0.52 * Math.cos(t * Math.PI / 2) ** 0.75 - 0.3 * Math.max(0, (t - 0.8) / 0.2) ** 2;
    for (let j = 0; j <= nr; j++) {
      const t = j / nr;               // 0 : sommet → 1 : bord
      const rowT = [];
      for (let i = 0; i <= cs; i++) {
        const a = i / cs * TAU, rr = cr * Math.sin(t * Math.PI / 2 * 1.02) * rim(a);
        const yy = capY(t);
        const p = T(Math.sin(a) * rr, yy, Math.cos(a) * rr), n = v3(Math.sin(a) * Math.sin(t * 1.5), Math.cos(t * 1.5) + 0.1, Math.cos(a) * Math.sin(t * 1.5)).applyQuaternion(q).normalize();
        const k = (0.8 + 0.2 * (1 - t)) * (t > 0.85 ? 0.85 : 1);
        rowT.push(Cp.v(p.x, p.y, p.z, n.x, n.y, n.z, Math.sin(a) * rr * 0.4 + 0.5, Math.cos(a) * rr * 0.4 + 0.5, [capCol.r * k, capCol.g * k, capCol.b * k]));
      }
      top.push(rowT);
    }
    Cp.grid(0, top);
    // dessous : de l'ourlet au pied, lamelles (rides radiales), crème
    const nu2 = lite ? 3 : 5;
    for (let j = 0; j <= nu2; j++) {
      const t = j / nu2, row = [];
      for (let i = 0; i <= cs; i++) {
        const a = i / cs * TAU, r0 = cr * rim(a) * 0.995, r1 = 0, rr = r0 + (r1 - r0) * Math.pow(t, 0.8);
        const gill = Math.abs(Math.sin(a * (lite ? 18 : 36))) * 0.05 * Math.min(1, t * 4) * (1 - t);
        const yy = capY(1) + 0.02 + (0.18 + 0.12) * t - 0.08 * Math.sin(t * Math.PI) - gill;
        const p = T(Math.sin(a) * rr, yy, Math.cos(a) * rr), n = v3(Math.sin(a) * 0.2, -1, Math.cos(a) * 0.2).applyQuaternion(q).normalize();
        const k = 0.62 + 0.3 * (1 - t) - gill * 3;
        row.push(Cp.v(p.x, p.y, p.z, n.x, n.y, n.z, a * 2, t, [0.95 * k, 0.86 * k, 0.72 * k]));
      }
      under.push(row);
    }
    // (sens inverse : on regarde le dessous depuis le bas)
    Cp.grid(0, under);
    // pois blancs en relief (moitiés de boules cabossées aplaties, posées sur le dôme)
    const ns = lite ? 7 : 11;
    for (let s = 0; s < ns; s++) {
      const t = 0.15 + 0.7 * ((s * 0.618) % 1), a = s * 2.4 + rnd() * 0.5, rr = cr * Math.sin(t * Math.PI / 2 * 1.02) * rim(a);
      const yy = capY(t) - 0.02;
      const sz = cr * (0.12 + rnd() * 0.07), g = lumpySphere(sz, lite ? 1 : 2, 0.04, 4, s, 0.22);
      const n = v3(Math.sin(a) * Math.sin(t * 1.5), Math.cos(t * 1.5) + 0.1, Math.cos(a) * Math.sin(t * 1.5)).normalize();
      m.compose(T(Math.sin(a) * rr, yy, Math.cos(a) * rr), q.clone().multiply(new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), n)), v3(1, 1, 1));
      Cp.add(0, g, m, (X, Y, Z, nx, ny) => [1.15, 1.12, 1.06], [0.3, 0.3]);
    }
  }
  // porte ronde en planches, cadre, poignée ; marche de pierre
  const zf = (y) => rAt(y) - 0.02;
  {
    const door = new THREE.Shape(); door.moveTo(-0.48, 0); door.lineTo(0.48, 0); door.lineTo(0.48, 1.3); door.absarc(0, 1.3, 0.48, 0, Math.PI, false); door.lineTo(-0.48, 0);
    const dg = new THREE.ExtrudeGeometry(door, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: lite ? 6 : 12 });
    const dp = dg.attributes.position, du = dg.attributes.uv; for (let i = 0; i < dp.count; i++) du.setXY(i, dp.getX(i) * 0.9 + 0.5, dp.getY(i) * 0.5);
    place(dg, Wd, (X, Y, Z, nx, ny, nz) => [0.62, 0.42, 0.26], null, 0, 0, zf(0.8) - 0.04);
    const fr = new THREE.TorusGeometry(0.52, 0.06, 5, lite ? 8 : 16, Math.PI); place(fr, Wd, [0.42, 0.28, 0.17], [4, 0.3], 0, 1.3, zf(1.3) + 0.06);
    for (const sx of [-1, 1]) place(new THREE.BoxGeometry(0.1, 1.32, 0.1), Wd, [0.42, 0.28, 0.17], [1, 1], sx * 0.52, 0.65, zf(0.65) + 0.06);
    place(new THREE.SphereGeometry(0.06, 8, 6), Wd, [0.95, 0.75, 0.25], null, 0.3, 0.75, zf(0.75) + 0.12);
    const step = lumpySphere(0.6, 1, 0.12, 3, 7, 0.22); place(step, Wd, [0.62, 0.6, 0.56], [0.5, 0.5], 0, 0.02, zf(0) + 0.45);
  }
  // deux fenêtres rondes : cadre de bois, vitre chaude (lumière), croisillon
  for (const sx of [-1, 1]) {
    const a = sx * 1.2, y = Math.min(H - 0.75, 2.0), rr = rAt(y);
    const lx = Math.sin(a) * rr, lz = Math.cos(a) * rr;
    const gl = new THREE.CircleGeometry(0.3, lite ? 10 : 16); m.compose(T(lx * 1.005, y, lz * 1.005), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, a, 0))), v3(1, 1, 1));
    Gl.add(0, gl, m, (X, Y, Z) => [1.0, 0.82, 0.45]);
    const fr = new THREE.TorusGeometry(0.32, 0.06, 5, lite ? 10 : 16); place(fr, Wd, [0.45, 0.3, 0.18], [4, 0.3], lx * 1.02, y, lz * 1.02, 0, a, 0);
    place(new THREE.BoxGeometry(0.04, 0.6, 0.04), Wd, [0.4, 0.26, 0.15], null, lx * 1.03, y, lz * 1.03, 0, a, 0);
    place(new THREE.BoxGeometry(0.6, 0.04, 0.04), Wd, [0.4, 0.26, 0.15], null, lx * 1.03, y, lz * 1.03, 0, a, 0);
    // jardinière sous la fenêtre
    place(roundBox(0.62, 0.14, 0.18, 0.03, 1), Wd, [0.5, 0.34, 0.2], null, lx * 1.06, y - 0.42, lz * 1.06, 0, a, 0);
    for (let k = 0; k < 4; k++) place(lumpySphere(0.07, 1, 0.2, 6, k + sx), Gl, [[1, 0.5, 0.6], [1, 0.85, 0.3], [0.8, 0.6, 1], [1, 0.6, 0.4]][k], null, lx * 1.06 + Math.cos(a) * (k - 1.5) * 0.14, y - 0.3, lz * 1.06 - Math.sin(a) * (k - 1.5) * 0.14);
  }
  // petit tuyau de cheminée en pierre
  place(new THREE.CylinderGeometry(0.16, 0.19, 0.8, 10), P, [0.62, 0.58, 0.55], [1, 0.5], cr * 0.35, H + 0.95, -cr * 0.2);
  place(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), P, [0.5, 0.47, 0.45], null, cr * 0.35, H + 1.36, -cr * 0.2);
}
const mushMats = {};
/** Matières des maisons-champignons : [crépi, chapeau, bois, vitres et fleurs (lumineuses)]. */
export function mushHouseMaterials(lite = false) {
  const k = lite ? 'l' : 'h';
  if (mushMats[k]) return mushMats[k];
  const st = stuccoTex(), ct = capTex(), wt = woodTex();
  const plaster = new THREE.MeshStandardMaterial({ map: st.map, normalMap: lite ? null : st.normalMap, vertexColors: true, roughness: 0.95 });
  const cap = new THREE.MeshStandardMaterial({ map: ct.map, normalMap: lite ? null : ct.normalMap, vertexColors: true, roughness: 0.55 });
  const wood = new THREE.MeshStandardMaterial({ map: wt.map, normalMap: lite ? null : wt.normalMap, vertexColors: true, roughness: 0.8 });
  const glow = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, emissive: 0xffffff, emissiveIntensity: 0.0 });
  glow.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n  totalEmissiveRadiance += diffuseColor.rgb * step(0.8, diffuseColor.r) * step(0.4, diffuseColor.b) * step(diffuseColor.b, 0.5) * 0.9;'); };
  glow.customProgramCacheKey = () => 'sc-glow';
  return (mushMats[k] = [plaster, cap, wood, glow]);
}

// =============================================================================
// Foin et paille : bottes carrées ficelées, grosses bottes roulées, meules
// =============================================================================
/** Paille tassée : des milliers de brins dorés presque alignés (u), relief marqué. */
export function strawTex() {
  return once('straw', () => RT.realTex(256, 256, 71, (x, y, w, h, R) => {
    x.fillStyle = '#c9a04e'; x.fillRect(0, 0, w, h);
    y.fillStyle = '#505050'; y.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const px = R() * w, py = R() * h, L = 14 + R() * 30, a = (R() - 0.5) * 0.5, v = R();
      const c = v < 0.45 ? `rgb(${236 + R() * 19 | 0},${200 + R() * 30 | 0},${110 + R() * 40 | 0})` : v < 0.85 ? `rgb(${200 + R() * 20 | 0},${155 + R() * 25 | 0},${70 + R() * 20 | 0})` : `rgb(${140 + R() * 20 | 0},${100 + R() * 20 | 0},${45 + R() * 15 | 0})`;
      const hv = 120 + R() * 135 | 0, lw = 1 + R() * 1.6, dx = Math.cos(a) * L, dy = Math.sin(a) * L;
      wrapDraw(w, h, px, py, 50, (X, Y) => {
        x.strokeStyle = c; x.lineWidth = lw; x.beginPath(); x.moveTo(X, Y); x.lineTo(X + dx, Y + dy); x.stroke();
        y.strokeStyle = `rgb(${hv},${hv},${hv})`; y.lineWidth = lw; y.beginPath(); y.moveTo(X, Y); y.lineTo(X + dx, Y + dy); y.stroke();
      });
    }
  }, { strength: 4 }));
}
export const strawMaterial = (lite = touchLite()) => texMat('straw', strawTex(), lite, { roughness: 1 });

/** Touffes de brins (petites lames pleines) qui dépassent d'une surface : bords « ébouriffés ». */
function strawTufts(B, n, pick, rnd, len = 0.18) {
  for (let i = 0; i < n; i++) {
    const { p, nrm } = pick(rnd);
    const dir = nrm.clone().add(v3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).multiplyScalar(0.9)).normalize();
    const side = dir.clone().cross(Math.abs(dir.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0)).normalize().multiplyScalar(0.012 + rnd() * 0.01);
    const L = len * (0.5 + rnd());
    const a = p.clone().add(side), b = p.clone().sub(side), c = p.clone().addScaledVector(dir, L);
    const k = 0.85 + rnd() * 0.3, col = [1.0 * k, 0.92 * k, 0.7 * k], u0 = rnd() * 4, v0 = rnd() * 4;
    const ia = B.v(a.x, a.y, a.z, nrm.x, nrm.y, nrm.z, u0, v0, col), ib = B.v(b.x, b.y, b.z, nrm.x, nrm.y, nrm.z, u0, v0 + 0.02, col), ic = B.v(c.x, c.y, c.z, nrm.x, nrm.y, nrm.z, u0 + L * 1.5, v0 + 0.01, col);
    B.tri(0, ia, ib, ic); B.tri(0, ia, ic, ib);
  }
}

/**
 * Botte carrée (cube unité centré : mise à l'échelle par instance) : flancs bombés et cabossés,
 * arêtes arrondies, deux ficelles enfoncées, brins qui dépassent aux bouts.
 */
export function squareBaleGeometry(opts = {}) {
  const lite = opts.lite === undefined ? touchLite() : opts.lite, rnd = rng(opts.seed || 5);
  const g = roundBox(1, 1, 1, 0.1, lite ? 2 : 3), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // bombé : le milieu des faces ressort ; ficelles : sillon à x = ±0,25 sur le dessus, le dessous et les côtés
    const bulge = 1 + 0.035 * (1 - Math.abs(x) * 1.6) * (Math.abs(y) < 0.45 || Math.abs(z) < 0.45 ? 1 : 0);
    const groove = Math.abs(x) < 0.47 ? 1 - 0.035 * Math.exp(-(((Math.abs(x) - 0.25) / 0.025) ** 2)) : 1;
    const nz = 1 + (noise3(x * 4, y * 4, z * 4) - 0.5) * 0.04;
    p.setXYZ(i, x * nz, y * bulge * groove * nz, z * bulge * groove * nz);
  }
  g.computeVertexNormals();
  const B = builder(1);
  B.add(0, g, null, (X, Y, Z) => {
    const tw = Math.exp(-(((Math.abs(X) - 0.25) / 0.03) ** 2));      // la ficelle
    if (tw > 0.5) return [0.55, 0.42, 0.25];
    const k = 0.78 + 0.22 * (Y + 0.5);
    return [k, k, k];
  });
  const body = boxUV(B.geometry().toNonIndexed(), 1.6);
  // brins qui dépassent (bouts et arêtes)
  const T = builder(1);
  strawTufts(T, lite ? 24 : 60, (r) => { const sx = r() < 0.5 ? -1 : 1; return { p: v3(sx * 0.5, (r() - 0.5) * 0.9, (r() - 0.5) * 0.9), nrm: v3(sx, 0, 0) }; }, rnd, 0.12);
  strawTufts(T, lite ? 10 : 30, (r) => { const sz = r() < 0.5 ? -1 : 1; return { p: v3((r() - 0.5) * 0.95, 0.5 * (r() < 0.5 ? -1 : 1) * 0.98, sz * 0.5), nrm: v3(0, 0.3, sz).normalize() }; }, rnd, 0.1);
  return concatGeos([body, T.geometry().toNonIndexed()]);
}

/**
 * Grosse botte roulée (axe x, rayon R, longueur L, centre en 0) : flanc bombé, bouts un peu creux où
 * l'on voit l'enroulement en spirale, filet de ficelle, brins qui dépassent.
 */
export function roundBaleGeometry(R = 0.8, L = 1.3, opts = {}) {
  const lite = opts.lite === undefined ? touchLite() : opts.lite, rnd = rng(opts.seed || 9), B = builder(1);
  const sides = lite ? 18 : 32, nl = lite ? 4 : 8;
  // flanc
  const rows = [];
  for (let j = 0; j <= nl; j++) {
    const t = j / nl, x = (t - 0.5) * L, row = [];
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * TAU, rr = R * (1 + 0.04 * Math.sin(t * Math.PI) - 0.05 * (Math.abs(t - 0.5) * 2) ** 6 + (noise3(Math.cos(a) * 2, t * 3, Math.sin(a) * 2) - 0.5) * 0.05);
      const y = Math.sin(a) * rr, z = Math.cos(a) * rr, k = 0.7 + 0.3 * (Math.sin(a) * 0.5 + 0.5);
      row.push(B.v(x, y, z, 0, Math.sin(a), Math.cos(a), a / TAU * 4, t * 1.3, [k, k, k]));
    }
    rows.push(row);
  }
  B.grid(0, rows);
  // bouts : disques légèrement creux, spirale d'enroulement (couleur des sommets)
  const nr = lite ? 5 : 10;
  for (const sx of [-1, 1]) {
    const ring = [];
    for (let j = 0; j <= nr; j++) {
      const t = j / nr, row = [];
      for (let i = 0; i <= sides; i++) {
        const a = i / sides * TAU, rr = R * (1 - t) * (1 - 0.05 * (1 - t) ** 6) + 0.0001;
        const x = sx * (L / 2 - 0.06 * Math.sin(t * Math.PI) * 0.6 - 0.04 * t);
        const sp = Math.sin((rr / R) * 26 - a * sx);
        const k = 0.72 + 0.16 * sp + 0.1 * (Math.sin(a) * 0.5 + 0.5);
        row.push(B.v(x, Math.sin(a) * rr, Math.cos(a) * rr, sx, 0, 0, Math.cos(a) * rr * 1.2 + 0.5, Math.sin(a) * rr * 1.2 + 0.5, [k, k * 0.97, k * 0.92]));
      }
      ring.push(row);
    }
    if (sx > 0) B.grid(0, ring); else B.grid(0, ring.map(r => r.slice().reverse()));
  }
  const body = B.geometry().toNonIndexed();
  // brins qui dépassent (surtout au bord des bouts)
  const T = builder(1);
  strawTufts(T, lite ? 30 : 80, (r) => { const a = r() * TAU, sx = r() < 0.5 ? -1 : 1, onEdge = r() < 0.6; const x = onEdge ? sx * L / 2 * 0.98 : (r() - 0.5) * L, rr = R * (onEdge ? 0.97 : 1.0); return { p: v3(x, Math.sin(a) * rr, Math.cos(a) * rr), nrm: v3(onEdge ? sx * 0.7 : 0, Math.sin(a), Math.cos(a)).normalize() }; }, rnd, 0.16);
  return concatGeos([body, T.geometry().toNonIndexed()]);
}

/** Meule de foin (dôme, pied en 0, rayon R) : paille cabossée, brins ébouriffés, chapeau noué au sommet. */
export function haystackGeometry(R = 1.35, H = 1.1, opts = {}) {
  const lite = opts.lite === undefined ? touchLite() : opts.lite, rnd = rng(opts.seed || 13), B = builder(1);
  const sides = lite ? 20 : 36, nv = lite ? 7 : 12, rows = [];
  for (let j = 0; j <= nv; j++) {
    const t = j / nv, row = [];             // 0 : sommet → 1 : pied
    for (let i = 0; i <= sides; i++) {
      const a = i / sides * TAU, n = noise3(Math.cos(a) * 2.5, t * 4, Math.sin(a) * 2.5);
      const rr = R * Math.sin(t * Math.PI / 2) ** 0.85 * (1 + (n - 0.5) * 0.12 + (t > 0.9 ? 0.04 : 0));
      const y = H * Math.cos(t * Math.PI / 2) ** 0.9 + (n - 0.5) * 0.06;
      const k = 0.68 + 0.32 * (1 - t * 0.6);
      row.push(B.v(Math.cos(a) * rr, y, Math.sin(a) * rr, Math.cos(a) * Math.sin(t * 1.5), Math.cos(t * 1.5), Math.sin(a) * Math.sin(t * 1.5), a / TAU * 5, t * 2, [k, k, k]));
    }
    rows.push(row);
  }
  B.grid(0, rows.map(r => r.slice().reverse()));
  // chapeau noué et corde
  const knot = lumpySphere(0.22, 1, 0.2, 5, 3, 0.8); const m = new THREE.Matrix4().makeTranslation(0, H + 0.05, 0); B.add(0, knot, m, [0.9, 0.82, 0.6], [1, 1]);
  const rope = new THREE.TorusGeometry(R * 0.72, 0.04, 4, sides); rope.rotateX(Math.PI / 2); m.makeTranslation(0, H * 0.62, 0); B.add(0, rope, m, [0.55, 0.42, 0.25], [6, 0.3]);
  const body = B.geometry({ normals: true }).toNonIndexed();
  const T = builder(1);
  strawTufts(T, lite ? 40 : 110, (r) => { const a = r() * TAU, t = 0.25 + r() * 0.75, rr = R * Math.sin(t * Math.PI / 2) ** 0.85, y = H * Math.cos(t * Math.PI / 2) ** 0.9; return { p: v3(Math.cos(a) * rr * 0.98, y, Math.sin(a) * rr * 0.98), nrm: v3(Math.cos(a), 0.4 - t * 0.6, Math.sin(a)).normalize() }; }, rnd, 0.22);
  return concatGeos([body, T.geometry().toNonIndexed()]);
}
Object.assign(LIFE_PROPS, {
  hayHD() { const g = roundBaleGeometry(0.62, 1.3); g.translate(0, 0.62, 0); return { geo: g, mat: strawMaterial(), h: 1.25, r: 0.75, shadow: true }; },
  baleHD() { const g = squareBaleGeometry(); g.scale(1.2, 0.6, 0.65); g.translate(0, 0.3, 0); return { geo: g, mat: strawMaterial(), h: 0.65, r: 0.7, shadow: true }; },
  haystackHD() { return { geo: haystackGeometry(1.35, 1.1), mat: strawMaterial(), h: 1.1, r: 1.3, shadow: true }; },
});

// =============================================================================
// Cabines de plage : planches peintes (rayures d'une planche sur deux), toit à deux pans qui
// déborde, bandeaux de rive, porte à hublot, marche. Toutes dans un constructeur partagé.
// =============================================================================
/** Planches peintes (blanc cassé, veinage léger, joints creux, peinture un peu usée). */
export function paintedWoodTex() {
  return once('pwood', () => RT.realTex(256, 256, 83, (x, y, w, h, R) => {
    x.fillStyle = '#f2efe8'; x.fillRect(0, 0, w, h);
    y.fillStyle = '#909090'; y.fillRect(0, 0, w, h);
    const n = 4, pw = w / n;
    for (let k = 0; k < n; k++) {
      const x0 = k * pw;
      for (let i = 0; i < 40; i++) { const gx = x0 + R() * pw; x.strokeStyle = `rgba(150,130,110,${0.05 + R() * 0.08})`; x.lineWidth = 0.6 + R(); x.beginPath(); x.moveTo(gx, 0); for (let yy = 0; yy <= h; yy += 16) x.lineTo(gx + Math.sin(yy * 0.04 + i) * 2, yy); x.stroke(); }
      for (let i = 0; i < 6; i++) { x.fillStyle = 'rgba(160,130,100,0.12)'; x.beginPath(); x.ellipse(x0 + R() * pw, R() * h, 2 + R() * 6, 6 + R() * 20, 0, 0, TAU); x.fill(); }
      x.fillStyle = 'rgba(60,50,40,0.55)'; x.fillRect(x0, 0, 2.5, h); x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillRect(x0 + 2.5, 0, 1.5, h);
      y.fillStyle = '#101010'; y.fillRect(x0, 0, 3, h);
      const hg = y.createLinearGradient(x0, 0, x0 + pw, 0); hg.addColorStop(0, '#606060'); hg.addColorStop(0.15, '#b0b0b0'); hg.addColorStop(0.85, '#b0b0b0'); hg.addColorStop(1, '#707070');
      y.fillStyle = hg; y.fillRect(x0 + 3, 0, pw - 3, h);
    }
  }, { strength: 3 }));
}
export const paintedWoodMaterial = (lite = touchLite()) => texMat('pwood', paintedWoodTex(), lite, { roughness: 0.75 });

/**
 * Cabine de plage (pied en (x, y, z), porte vers -z) : W × D, murs de hauteur Hw. Les planches
 * verticales (0,3 m) alternent couleur et blanc ; coins et bandeaux blancs ; toit à deux pans.
 */
export function addBeachHut(B, h, opts = {}) {
  const lite = !!opts.lite, W = opts.w || 2.6, D = opts.d || 2.2, Hw = opts.hw || 2.6, rnd = rng(Math.round(h.x * 31 + h.z * 17) >>> 0);
  const col = new THREE.Color(h.color), white = [0.98, 0.97, 0.95], m = new THREE.Matrix4();
  const O = v3(h.x, h.y, h.z);
  const add = (g, c, x, y, z, rx = 0, ry = 0, rz = 0, uvS) => { m.compose(v3(x, y, z).add(O), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), v3(1, 1, 1)); B.add(0, g, m, c, uvS); };
  // murs : 4 faces en planches (une bande de quads par planche, couleur alternée)
  const plank = 0.3;
  const wall = (ax, az, bx, bz, nx, nz, faceH) => {
    const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(L / plank));
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n, c = i % 2 ? white : [col.r, col.g, col.b];
      const p0x = ax + (bx - ax) * t0, p0z = az + (bz - az) * t0, p1x = ax + (bx - ax) * t1, p1z = az + (bz - az) * t1;
      const tm = (t0 + t1) / 2, top0 = faceH(t0), top1 = faceH(t1);
      const sh = (k) => c.map(v => v * k);
      const off = (i % 2 ? 0.0 : 0.012);   // planches de couleur un peu en relief
      const ids = [
        B.v(O.x + p0x + nx * off, O.y, O.z + p0z + nz * off, nx, 0, nz, i * 0.25, 0, sh(0.7)),
        B.v(O.x + p1x + nx * off, O.y, O.z + p1z + nz * off, nx, 0, nz, i * 0.25 + 0.25, 0, sh(0.7)),
        B.v(O.x + p0x + nx * off, O.y + top0, O.z + p0z + nz * off, nx, 0, nz, i * 0.25, top0 / 1.2, sh(1.0)),
        B.v(O.x + p1x + nx * off, O.y + top1, O.z + p1z + nz * off, nx, 0, nz, i * 0.25 + 0.25, top1 / 1.2, sh(1.0)),
      ];
      B.quad(0, ids[1], ids[0], ids[3], ids[2]);
      void tm;
    }
  };
  const hw = W / 2, hd = D / 2, ridge = 0.95;
  const gable = (t) => Hw + ridge * (1 - Math.abs(t - 0.5) * 2);
  wall(-hw, -hd, hw, -hd, 0, -1, gable);          // devant (pignon)
  wall(hw, hd, -hw, hd, 0, 1, gable);             // derrière (pignon)
  wall(hw, -hd, hw, hd, 1, 0, () => Hw);          // côtés
  wall(-hw, hd, -hw, -hd, -1, 0, () => Hw);
  // poteaux d'angle et bandeaux blancs
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) add(roundBox(0.12, Hw, 0.12, 0.02, 1), white, sx * hw, Hw / 2, sz * hd);
  add(roundBox(W + 0.1, 0.1, 0.06, 0.02, 1), white, 0, 0.08, -hd - 0.02); add(roundBox(W + 0.1, 0.1, 0.06, 0.02, 1), white, 0, 0.08, hd + 0.02);
  // toit à deux pans (planches de rive), qui déborde
  const ov = 0.28, slope = Math.atan2(ridge, hw), L = Math.hypot(hw + ov, ridge + ov * Math.tan(slope)) + 0.02;
  const roofC = [col.r * 0.8, col.g * 0.8, col.b * 0.8];
  for (const sx of [-1, 1]) {
    const g = roundBox(L, 0.09, D + ov * 2, 0.03, 1);
    const cy = (Hw + ridge + Hw - ov * Math.tan(slope)) / 2 + 0.06;
    add(g, (X, Y, Z, nx, ny) => (ny > 0.3 ? roofC : white), sx * (hw + ov) / 2, cy, 0, 0, 0, -sx * slope, [1.2, 1.2]);
    // bandeaux de rive (pignons)
    for (const sz of [-1, 1]) add(roundBox(L, 0.16, 0.05, 0.02, 1), white, sx * (hw + ov) / 2, cy - 0.08, sz * (hd + ov - 0.02), 0, 0, -sx * slope);
  }
  add(new THREE.CylinderGeometry(0.06, 0.06, D + ov * 2, 6), white, 0, Hw + ridge + 0.03, 0, Math.PI / 2, 0, 0);
  // porte à hublot (devant, -z) et marche
  add(roundBox(0.95, 1.8, 0.07, 0.03, 1), [0.97, 0.95, 0.9], 0, 0.95, -hd - 0.04);
  const port = new THREE.TorusGeometry(0.17, 0.045, 5, lite ? 10 : 16); add(port, [0.85, 0.65, 0.3], 0, 1.4, -hd - 0.09);
  const glass = new THREE.CircleGeometry(0.16, lite ? 10 : 16); add(glass, [0.35, 0.55, 0.7], 0, 1.4, -hd - 0.085, 0, Math.PI, 0);
  add(new THREE.SphereGeometry(0.05, 6, 5), [0.85, 0.65, 0.3], 0.32, 0.95, -hd - 0.1);
  add(roundBox(1.2, 0.14, 0.45, 0.03, 1), [0.75, 0.6, 0.45], 0, 0.07, -hd - 0.3);
  // bouée accrochée sur le côté (un coup sur deux)
  if (rnd() < 0.6) { const b = new THREE.TorusGeometry(0.28, 0.08, 6, lite ? 12 : 18); add(b, (X, Y, Z) => (Math.floor((Math.atan2(Y - O.y - 1.6, Z - O.z) + 3.2) / (Math.PI / 4)) % 2 ? [0.95, 0.25, 0.2] : white), hw + 0.1, 1.6, 0, 0, Math.PI / 2, 0); }
}

// =============================================================================
// Champignons rebondissants et trampolines (la ville)
// =============================================================================
/** Chapeau de champignon seul (base en y = 0, rayon R, hauteur ~0,6 R) : dôme charnu, pois en relief, lamelles. */
export function mushroomCapGeometry(R, hex, opts = {}) {
  const lite = !!opts.lite, B = builder(1), m = new THREE.Matrix4(), col = new THREE.Color(hex), rnd = rng(opts.seed || 3);
  const nr = lite ? 7 : 12, cs = lite ? 24 : 40, H = R * 0.62, top = [];
  const rim = (a) => 1 + 0.04 * Math.sin(a * 5 + 1.1) + 0.025 * Math.sin(a * 9);
  const cy = (t) => H * Math.cos(t * Math.PI / 2) ** 0.75 - H * 0.35 * Math.max(0, (t - 0.8) / 0.2) ** 2;
  for (let j = 0; j <= nr; j++) {
    const t = j / nr, row = [];
    for (let i = 0; i <= cs; i++) {
      const a = i / cs * TAU, rr = R * Math.sin(t * Math.PI / 2 * 1.02) * rim(a), n = v3(Math.cos(a) * Math.sin(t * 1.5), Math.cos(t * 1.5) + 0.1, Math.sin(a) * Math.sin(t * 1.5)).normalize();
      const k = (0.82 + 0.18 * (1 - t)) * (t > 0.85 ? 0.85 : 1);
      row.push(B.v(Math.cos(a) * rr, cy(t), Math.sin(a) * rr, n.x, n.y, n.z, Math.cos(a) * rr * 0.5 + 0.5, Math.sin(a) * rr * 0.5 + 0.5, [col.r * k, col.g * k, col.b * k]));
    }
    top.push(row);
  }
  B.grid(0, top.map(r => r.slice().reverse())); B.grid(0, top.slice(Math.floor(nr * 0.75)));
  const under = [];
  for (let j = 0; j <= (lite ? 2 : 4); j++) {
    const t = j / (lite ? 2 : 4), row = [];
    for (let i = 0; i <= cs; i++) {
      const a = i / cs * TAU, rr = R * rim(a) * (1 - t), gill = Math.abs(Math.sin(a * (lite ? 14 : 28))) * 0.04 * R * Math.min(1, t * 4) * (1 - t);
      const k = 0.6 + 0.3 * (1 - t) - gill * 2 / R;
      row.push(B.v(Math.cos(a) * rr, cy(1) + 0.02 + t * H * 0.3 - gill, Math.sin(a) * rr, 0, -1, 0, a, t, [0.95 * k, 0.86 * k, 0.74 * k]));
    }
    under.push(row);
  }
  B.grid(0, under.map(r => r.slice().reverse())); B.grid(0, under);   // (les deux faces : jamais de trou sous le bord)
  for (let s = 0; s < (lite ? 6 : 9); s++) {
    const t = 0.15 + 0.68 * ((s * 0.618) % 1), a = s * 2.4 + rnd() * 0.4, rr = R * Math.sin(t * Math.PI / 2 * 1.02) * rim(a);
    const g = lumpySphere(R * (0.12 + rnd() * 0.06), 1, 0.04, 4, s, 0.22);
    const n = v3(Math.cos(a) * Math.sin(t * 1.5), Math.cos(t * 1.5) + 0.1, Math.sin(a) * Math.sin(t * 1.5)).normalize();
    m.compose(v3(Math.cos(a) * rr, cy(t) - 0.01, Math.sin(a) * rr), new THREE.Quaternion().setFromUnitVectors(v3(0, 1, 0), n), v3(1, 1, 1));
    B.add(0, g, m, [1.15, 1.12, 1.06], [0.3, 0.3]);
  }
  return B.geometry();
}
/** Pied de champignon (de 0 à h, rayon r), crépi, un peu bombé ; ou socle de trampoline. */
export function mushroomStemGeometry(r, h, opts = {}) {
  const lite = !!opts.lite, prof = [];
  for (let i = 0; i <= 8; i++) { const t = i / 8; prof.push(new THREE.Vector2(r * (1.25 - 0.35 * t + 0.08 * Math.sin(t * Math.PI)), h * t)); }
  const g = new THREE.LatheGeometry(prof, lite ? 12 : 20), c = new Float32Array(g.attributes.position.count * 3);
  for (let i = 0; i < g.attributes.position.count; i++) { const k = 0.75 + 0.25 * clamp(g.attributes.position.getY(i) / h * 1.5, 0, 1) - 0.2 * clamp((g.attributes.position.getY(i) - h * 0.8) / (h * 0.2), 0, 1); c[i * 3] = k * 0.98; c[i * 3 + 1] = k * 0.94; c[i * 3 + 2] = k * 0.86; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * r * 6, uv.getY(i) * h);
  return g;
}
/**
 * Trampoline (pied en 0, rayon r, plateau à h) : { frame (boudin rembourré rayé, pieds et ressorts),
 * mat (toile tressée sombre, centrée en 0 : c'est elle qui s'enfonce) }.
 */
export function trampolineParts(r, h, opts = {}) {
  const lite = !!opts.lite, F = builder(1), M = builder(1), m = new THREE.Matrix4();
  const cA = new THREE.Color(opts.a || 0x3a8ae0), cB = new THREE.Color(opts.b || 0xffd23a), seg = lite ? 24 : 40;
  // boudin rembourré, segments de couleurs alternées
  const pad = new THREE.TorusGeometry(r * 0.94, 0.18, lite ? 6 : 10, seg); pad.rotateX(Math.PI / 2); m.makeTranslation(0, h - 0.05, 0);
  F.add(0, pad, m, (X, Y, Z, nx, ny) => { const a = Math.atan2(Z, X), c = Math.floor((a + Math.PI) / TAU * 12) % 2 ? cA : cB, k = 0.8 + 0.2 * (ny * 0.5 + 0.5); return [c.r * k, c.g * k, c.b * k]; });
  // jupe de toile sous le boudin, et pieds en arc
  const skirt = new THREE.CylinderGeometry(r * 0.94, r * 0.9, h - 0.15, seg, 1, true); m.makeTranslation(0, (h - 0.15) / 2, 0);
  F.add(0, skirt, m, (X, Y, Z) => { const a = Math.atan2(Z, X), c = Math.floor((a + Math.PI) / TAU * 12) % 2 ? cA : cB; const k = 0.55 + 0.3 * clamp(Y / h, 0, 1); return [c.r * k, c.g * k, c.b * k]; });
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const leg = new THREE.TorusGeometry(0.22, 0.04, 4, 8, Math.PI); m.compose(v3(Math.cos(a) * r * 0.92, 0.02, Math.sin(a) * r * 0.92), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), v3(1, 1, 1)); F.add(0, leg, m, [0.3, 0.32, 0.36]); }
  // toile : disque tressé, ressorts tout autour (petites spires)
  const mat = new THREE.CircleGeometry(r * 0.8, seg); mat.rotateX(-Math.PI / 2);
  M.add(0, mat, null, (X, Y, Z) => { const d = Math.hypot(X, Z) / (r * 0.8); const k = 0.18 + 0.06 * Math.sin(d * 30) * (d < 0.95 ? 1 : 0); return [k, k * 1.05, k * 1.15]; }, [r * 3, r * 3]);
  for (let i = 0; i < (lite ? 16 : 32); i++) {
    const a = i / (lite ? 16 : 32) * TAU, sp = new THREE.CylinderGeometry(0.025, 0.025, r * 0.16, 4); sp.rotateZ(Math.PI / 2);
    m.compose(v3(Math.cos(a) * r * 0.86, -0.01, Math.sin(a) * r * 0.86), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -a, 0)), v3(1, 1, 1)); M.add(0, sp, m, [0.75, 0.75, 0.78]);
  }
  return { frame: F.geometry(), mat: M.geometry() };
}

/**
 * Toile de parasol (centrée : sommet à +h/2, bord à -h/2, comme un ConeGeometry ouvert) : pans tendus
 * entre les baleines (la toile se creuse entre elles), bord à festons, petit chapeau au sommet.
 * u fait le tour (n pans → une rayure par pan avec une texture à n rayures), v du sommet au bord.
 */
export function parasolCanopyGeometry(R = 1.5, h = 0.6, n = 12, opts = {}) {
  const lite = !!opts.lite, B = builder(1), per = lite ? 2 : 4, nv = lite ? 3 : 6;
  const N = n * per, rows = [];
  for (let j = 0; j <= nv; j++) {
    const v = j / nv, row = [];
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = u * TAU, f = (i % per) / per, sag = Math.sin(f * Math.PI) * 0.08 * v;
      const rr = R * v * (1 - sag * 0.4), y = h / 2 - h * Math.pow(v, 0.9) - sag * 0.9 * h;
      const k = 0.78 + 0.22 * (1 - v * 0.5) - sag;
      row.push(B.v(Math.sin(a) * rr, y, Math.cos(a) * rr, Math.sin(a) * 0.5, 1, Math.cos(a) * 0.5, u, v, [k, k, k]));
    }
    rows.push(row);
  }
  B.grid(0, rows);
  // festons qui pendent du bord
  const top = [], bot = [];
  for (let i = 0; i <= N * (lite ? 1 : 2); i++) {
    const u = i / (N * (lite ? 1 : 2)), a = u * TAU, sc = Math.sqrt(Math.abs(Math.sin(u * n * Math.PI)));
    top.push(B.v(Math.sin(a) * R, -h / 2, Math.cos(a) * R, Math.sin(a), 0, Math.cos(a), u, 1, [0.92, 0.92, 0.92]));
    bot.push(B.v(Math.sin(a) * R * 1.01, -h / 2 - 0.1 - 0.1 * sc, Math.cos(a) * R * 1.01, Math.sin(a), 0, Math.cos(a), u, 1, [0.78, 0.78, 0.78]));
  }
  B.grid(0, [top, bot]);
  const knob = new THREE.SphereGeometry(0.08, 8, 6); B.add(0, knob, new THREE.Matrix4().makeTranslation(0, h / 2 + 0.03, 0), [1, 1, 1], [0.01, 0.01]);
  return B.geometry();
}

/**
 * Le glacier (repère local, sol en y = 0) : comptoir en planches peintes rayées rose et blanc, plateau
 * de bois, bacs de glace en vitrine (boules cabossées), grand cornet-enseigne (gaufre quadrillée,
 * boule qui coule, cerise), parasol rayé à festons. Rend un groupe de 3 maillages.
 */
export function iceCreamStand(opts = {}) {
  const lite = !!opts.lite, Wd = builder(1), F = builder(1), m = new THREE.Matrix4(), rnd = rng(77);
  const pink = [1.0, 0.55, 0.72], white = [0.98, 0.97, 0.95];
  const add = (B, g, c, x, y, z, rx = 0, ry = 0, rz = 0, uvS) => { m.compose(v3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), v3(1, 1, 1)); B.add(0, g, m, c, uvS); };
  // comptoir : caisson (planches verticales alternées), plateau qui déborde, plinthe
  const cw = 3.2, ch = 1.1, cd = 1.4, cz = 1.4;
  add(Wd, roundBox(cw - 0.06, ch - 0.1, cd - 0.06, 0.03, 1), white.map(c => c * 0.85), 0, (ch - 0.1) / 2, cz);
  // planches verticales en relief, une sur deux rose (devant, derrière, côtés)
  const shade = (c) => (X, Y) => c.map(v => v * (0.68 + 0.32 * clamp(Y / ch, 0, 1)));
  const nP = Math.round(cw / 0.3);
  for (let i = 0; i < nP; i++) for (const sz of [-1, 1]) add(Wd, roundBox(0.28, ch - 0.16, 0.04, 0.012, 1), shade(i % 2 ? white : pink), -cw / 2 + 0.15 + i * (cw - 0.3) / (nP - 1), (ch - 0.1) / 2, cz + sz * (cd / 2 - 0.0));
  const nQ = Math.round(cd / 0.3);
  for (let i = 0; i < nQ; i++) for (const sx of [-1, 1]) add(Wd, roundBox(0.04, ch - 0.16, 0.28, 0.012, 1), shade(i % 2 ? white : pink), sx * (cw / 2), (ch - 0.1) / 2, cz - cd / 2 + 0.15 + i * (cd - 0.3) / (nQ - 1));
  add(Wd, roundBox(cw + 0.14, 0.09, cd + 0.14, 0.03, 1), [0.8, 0.6, 0.42], 0, ch - 0.04, cz);
  add(Wd, roundBox(cw, 0.12, cd, 0.02, 1), [0.55, 0.42, 0.36], 0, 0.06, cz);
  // vitrine : bacs de glace
  const cols = [[1.0, 0.62, 0.8], [1.0, 0.95, 0.75], [0.55, 0.36, 0.22], [0.62, 0.9, 0.66], [1.0, 0.85, 0.3]];
  for (let k = 0; k < 5; k++) {
    const x = -1.2 + k * 0.6;
    add(Wd, roundBox(0.5, 0.12, 0.42, 0.02, 1), [0.85, 0.85, 0.88], x, ch + 0.06, cz - 0.1);
    for (let s = 0; s < 4; s++) { const g = lumpySphere(0.15, lite ? 1 : 2, 0.1, 6, k * 3 + s, 0.85); add(F, g, (X, Y, Z, nx, ny) => cols[k].map(c => c * (0.8 + 0.2 * (ny * 0.5 + 0.5))), x + ((s % 2) - 0.5) * 0.16, ch + 0.2 + (s > 1 ? 0.1 : 0), cz - 0.1 + (s > 1 ? 0 : (s % 2 ? 0.07 : -0.07))); }
  }
  // grand cornet-enseigne sur son mât
  {
    const X = -1.9, Z = 2.2;
    add(Wd, new THREE.CylinderGeometry(0.07, 0.08, 2.4, 8), [0.85, 0.85, 0.88], X, 1.2, Z);
    const cone = new THREE.ConeGeometry(0.55, 1.6, lite ? 16 : 40, lite ? 6 : 16); cone.rotateX(Math.PI);
    add(F, cone, (x, y, z) => { const a = Math.atan2(z - Z, x - X), q = Math.sin(a * 8 + y * 9) * Math.sin(a * 8 - y * 9); const k = q > 0.6 ? 0.62 : 0.88; return [0.95 * k, 0.68 * k, 0.36 * k]; }, X, 2.6, Z);
    const scoop = lumpySphere(0.62, lite ? 1 : 2, 0.08, 3, 9, 0.9); add(F, scoop, (x, y, z, nx, ny) => [1.0, 0.6, 0.78].map(c => c * (0.85 + 0.15 * (ny * 0.5 + 0.5))), X, 3.55, Z);
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3, d = lumpySphere(0.1, 1, 0.05, 4, i, 1.6); add(F, d, [1.0, 0.6, 0.78], X + Math.cos(a) * 0.5, 3.18 - rnd() * 0.08, Z + Math.sin(a) * 0.5); }
    add(F, lumpySphere(0.13, 1, 0.03, 3, 2, 1), [0.85, 0.1, 0.15], X, 4.18, Z);
    add(F, new THREE.CylinderGeometry(0.012, 0.015, 0.22, 4), [0.3, 0.4, 0.15], X + 0.04, 4.36, Z, 0, 0, -0.4);
  }
  // parasol rayé (rose et blanc) à festons
  const can = parasolCanopyGeometry(2.2, 0.8, 12, { lite });
  const cl = builder(1); m.makeTranslation(0.6, 3.1, 2.0); cl.add(0, can, m, (X, Y, Z, nx, ny, nz, i) => [can.attributes.color.getX(i), can.attributes.color.getY(i), can.attributes.color.getZ(i)]);
  add(Wd, new THREE.CylinderGeometry(0.06, 0.06, 3, 6), [0.92, 0.92, 0.94], 0.6, 1.5, 2.0);
  const M = stallMaterials(0xff7ab0, lite), st = canvasStripeTex(0xff7ab0, 12);
  const cloth = stallMats.ice || (stallMats.ice = new THREE.MeshStandardMaterial({ map: st.map, normalMap: lite ? null : st.normalMap, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }));
  const g = new THREE.Group();
  const wg = Wd.geometry().toNonIndexed(); boxUV(wg, 1.3);
  const parts = [[wg, paintedWoodMaterial(lite)], [F.geometry(), M.food], [cl.geometry(), cloth]];
  for (const [geo, mat] of parts) { const k = new THREE.Mesh(geo, mat); k.castShadow = k.receiveShadow = true; g.add(k); }
  return g;
}

/** Toile rayée blanc / gris (teintée par l'instance : une rayure de couleur, une rayure claire). */
export function tintStripeTex(n = 12) {
  return once('tstripe' + n, () => RT.realTex(256, 64, 19, (x, y, w, h, R) => {
    for (let i = 0; i < n; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#a4a4a4'; x.fillRect(i * w / n, 0, w / n + 1, h); }
    for (let i = 0; i < w; i += 2) { x.fillStyle = 'rgba(0,0,0,' + (0.03 + R() * 0.04) + ')'; x.fillRect(i, 0, 1, h); y.fillStyle = 'rgba(160,160,160,0.6)'; y.fillRect(i, 0, 1, h); }
    for (let j = 0; j < h; j += 2) { y.fillStyle = 'rgba(100,100,100,0.4)'; y.fillRect(0, j, w, 1); }
  }, { strength: 1.5 }));
}
Object.assign(LIFE_PROPS, {
  /** Parasol (teinté) : toile tendue entre les baleines, festons, mât. */
  parasolHD() {
    const B = builder(1), m = new THREE.Matrix4();
    const can = parasolCanopyGeometry(1.45, 0.5, 12);
    m.makeTranslation(0, 2.35, 0); B.add(0, can, m, (X, Y, Z, nx, ny, nz, i) => [can.attributes.color.getX(i), can.attributes.color.getY(i), can.attributes.color.getZ(i)]);
    const pole = new THREE.CylinderGeometry(0.035, 0.04, 2.5, 6); m.makeTranslation(0, 1.25, 0); B.add(0, pole, m, [1.0, 1.0, 1.0], [0.01, 0.01]);
    const t = tintStripeTex(12);
    const mat = castleMats.parasol || (castleMats.parasol = new THREE.MeshStandardMaterial({ map: t.map, normalMap: touchLite() ? null : t.normalMap, vertexColors: true, roughness: 0.85, side: THREE.DoubleSide }));
    return { geo: B.geometry(), mat, h: 2.6, r: 1.45 };
  },
});

// =============================================================================
// Maisons du village de la plage : murs crépis colorés, toit de tuiles en croupe qui déborde,
// fenêtres à encadrement, volets en planches, jardinières, porte en planches et marche.
// Trois constructeurs partagés (crépi, tuiles, bois peint) : trois appels de dessin pour tout le village.
// =============================================================================
/** Tuiles canal (rangées de tuiles arrondies qui se chevauchent) — claires : la teinte vient des sommets. */
export function roofTileTex() {
  return once('tiles', () => RT.realTex(256, 256, 47, (x, y, w, h, R) => {
    x.fillStyle = '#d8d0c8'; x.fillRect(0, 0, w, h);
    y.fillStyle = '#404040'; y.fillRect(0, 0, w, h);
    const rows = 8, cols = 8, th = h / rows, tw = w / cols;
    for (let j = 0; j < rows; j++) for (let i = 0; i <= cols; i++) {
      const cx = (i + (j % 2) * 0.5) * tw, cy = j * th, v = 0.85 + R() * 0.25;
      const g = x.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0);
      const c = (k) => 'rgb(' + Math.min(255, 235 * v * k | 0) + ',' + Math.min(255, 228 * v * k | 0) + ',' + Math.min(255, 220 * v * k | 0) + ')';
      g.addColorStop(0, c(0.7)); g.addColorStop(0.45, c(1.05)); g.addColorStop(1, c(0.72));
      wrapDraw(w, h, cx, cy, tw, (X, Y) => {
        x.fillStyle = g; x.beginPath(); x.moveTo(X - tw / 2, Y); x.lineTo(X + tw / 2, Y); x.lineTo(X + tw / 2, Y + th * 1.05); x.quadraticCurveTo(X, Y + th * 1.35, X - tw / 2, Y + th * 1.05); x.fill();
        x.fillStyle = 'rgba(40,30,25,0.35)'; x.fillRect(X - tw / 2, Y + th * 1.02, tw, 2);
        const gh = y.createLinearGradient(X - tw / 2, 0, X + tw / 2, 0); gh.addColorStop(0, '#303030'); gh.addColorStop(0.5, '#e0e0e0'); gh.addColorStop(1, '#303030');
        y.fillStyle = gh; y.beginPath(); y.moveTo(X - tw / 2, Y); y.lineTo(X + tw / 2, Y); y.lineTo(X + tw / 2, Y + th * 1.05); y.quadraticCurveTo(X, Y + th * 1.35, X - tw / 2, Y + th * 1.05); y.fill();
      });
    }
  }, { strength: 4 }));
}
const houseMats = {};
/** [crépi, tuiles, bois peint] */
export function villageHouseMaterials(lite = false) {
  const k = lite ? 'l' : 'h';
  if (houseMats[k]) return houseMats[k];
  const st = stuccoTex(), rt = roofTileTex();
  const plaster = new THREE.MeshStandardMaterial({ map: st.map, normalMap: lite ? null : st.normalMap, vertexColors: true, roughness: 0.95 });
  const roof = new THREE.MeshStandardMaterial({ map: rt.map, normalMap: lite ? null : rt.normalMap, vertexColors: true, roughness: 0.8 });
  return (houseMats[k] = [plaster, roof, paintedWoodMaterial(lite)]);
}
/** Maison (h = { x, y, z, w, d, rot, color, roof }) : porte au milieu de la façade -z (repère tourné de rot). */
export function addVillageHouse(Bs, h, opts = {}) {
  const lite = !!opts.lite, [Pl, Rf, Wd] = Bs, m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, h.rot || 0, 0));
  const O = v3(h.x, h.y, h.z), W = h.w, D = h.d, H = 4.2;
  const cw = new THREE.Color(h.color), cr = new THREE.Color(h.roof);
  const put = (B, g, c, x, y, z, rx = 0, ry = 0, rz = 0, uvS) => { m.compose(v3(x, y, z).applyQuaternion(q).add(O), q.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz))), v3(1, 1, 1)); B.add(0, g, m, c, uvS); };
  // murs : boîte crépie, soubassement plus sombre, un peu d'ombre sous le toit
  const wall = roundBox(W, H, D, 0.06, 1);
  const wuv = wall.attributes.uv, wp = wall.attributes.position, wn = wall.attributes.normal;
  for (let i = 0; i < wp.count; i++) { const ax = Math.abs(wn.getX(i)) > Math.abs(wn.getZ(i)); wuv.setXY(i, (ax ? wp.getZ(i) : wp.getX(i)) * 0.35, wp.getY(i) * 0.35); }
  put(Pl, wall, (X, Y) => { const yy = Y - O.y; const k = (yy < 0.5 ? 0.78 : 1) * (1 - 0.18 * clamp((yy - 3.4) / 0.8, 0, 1)); return [cw.r * k, cw.g * k, cw.b * k]; }, 0, H / 2, 0);
  // toit en croupe : 4 pans (trapèzes et triangles) qui débordent, faîtage
  {
    const ov = 0.45, hx = W / 2 + ov, hz = D / 2 + ov, rh = 2.0, ridge = Math.max(0.2, (W - D) / 2), y0 = H - 0.12;
    const pts = { a: v3(-hx, y0, -hz), b: v3(hx, y0, -hz), c: v3(hx, y0, hz), d: v3(-hx, y0, hz), r0: v3(-ridge, y0 + rh, 0), r1: v3(ridge, y0 + rh, 0) };
    const face = (A, B2, C, E) => {
      const n = B2.clone().sub(A).cross(C.clone().sub(A)).normalize();
      const k = 0.75 + 0.25 * clamp(n.y, 0, 1), col = [cr.r * k, cr.g * k, cr.b * k];
      const ids = [A, B2, C, E].filter(Boolean).map((P) => { const w = P.clone().applyQuaternion(q).add(O); const nn = n.clone().applyQuaternion(q); const u = (Math.abs(n.x) > Math.abs(n.z) ? P.z : P.x) * 0.5, vv = (P.y - y0) / rh * Math.hypot(rh, Math.abs(n.x) > Math.abs(n.z) ? hx : hz) * 0.5; return Rf.v(w.x, w.y, w.z, nn.x, nn.y, nn.z, u, vv, col); });
      if (ids.length === 4) { Rf.tri(0, ids[0], ids[1], ids[3]); Rf.tri(0, ids[0], ids[3], ids[2]); } else Rf.tri(0, ids[0], ids[1], ids[2]);
    };
    face(pts.b, pts.a, pts.r1, pts.r0);   // devant
    face(pts.d, pts.c, pts.r0, pts.r1);   // derrière
    face(pts.c, pts.b, pts.r1);           // côté +x
    face(pts.a, pts.d, pts.r0);           // côté -x
    // dessous du débord (sombre), bandeau de rive, faîtage arrondi
    const eave = roundBox(W + ov * 2, 0.14, D + ov * 2, 0.04, 1); put(Wd, eave, [0.92, 0.9, 0.86], 0, y0 - 0.02, 0);
    const rg = new THREE.CylinderGeometry(0.1, 0.1, ridge * 2 + 0.3, 8); put(Rf, rg, [cr.r * 0.85, cr.g * 0.85, cr.b * 0.85], 0, y0 + rh + 0.02, 0, 0, 0, Math.PI / 2, [1, 1]);
  }
  // porte en planches, encadrement, marche
  put(Wd, roundBox(1.2, 2.2, 0.08, 0.03, 1), [0.62, 0.4, 0.24], 0, 1.1, -D / 2 - 0.04);
  put(Wd, roundBox(1.45, 0.14, 0.12, 0.03, 1), [0.97, 0.96, 0.93], 0, 2.27, -D / 2 - 0.05);
  for (const sx of [-1, 1]) put(Wd, roundBox(0.12, 2.25, 0.12, 0.03, 1), [0.97, 0.96, 0.93], sx * 0.66, 1.12, -D / 2 - 0.05);
  put(Wd, new THREE.SphereGeometry(0.06, 6, 5), [0.95, 0.78, 0.3], 0.42, 1.05, -D / 2 - 0.12);
  put(Pl, roundBox(1.6, 0.16, 0.6, 0.04, 1), [0.75, 0.72, 0.68], 0, 0.08, -D / 2 - 0.3);
  // fenêtres : encadrement, vitre, croisillons, volets en planches, appui et jardinière fleurie
  for (const sd of [-1, 1]) for (const wx of [-2.2, 2.2]) {
    const z = sd * (D / 2 + 0.03), ry = sd < 0 ? 0 : Math.PI;
    put(Wd, roundBox(1.25, 1.25, 0.06, 0.02, 1), [0.97, 0.96, 0.93], wx, 2.4, z, 0, ry);
    put(Wd, roundBox(1.0, 1.0, 0.04, 0.01, 1), [0.25, 0.42, 0.6], wx, 2.4, z + sd * 0.03, 0, ry);
    put(Wd, roundBox(0.05, 1.0, 0.05, 0.01, 1), [0.97, 0.96, 0.93], wx, 2.4, z + sd * 0.05, 0, ry);
    put(Wd, roundBox(1.0, 0.05, 0.05, 0.01, 1), [0.97, 0.96, 0.93], wx, 2.4, z + sd * 0.05, 0, ry);
    for (const vx of [-0.85, 0.85]) for (let pk = 0; pk < 3; pk++) put(Wd, roundBox(0.13, 1.25, 0.05, 0.015, 1), [cr.r * 0.9, cr.g * 0.9, cr.b * 0.9].map(c => c * (0.9 + pk * 0.05)), wx + vx + (pk - 1) * 0.14, 2.4, z + sd * 0.04, 0, ry);
    put(Wd, roundBox(1.4, 0.08, 0.22, 0.02, 1), [0.97, 0.96, 0.93], wx, 1.74, z + sd * 0.08, 0, ry);
    put(Wd, roundBox(1.1, 0.2, 0.22, 0.03, 1), [0.55, 0.38, 0.24], wx, 1.62, z + sd * 0.22, 0, ry);
    if (!lite) for (let f = 0; f < 5; f++) put(Wd, lumpySphere(0.09, 1, 0.2, 6, f + wx, 1), [[1, 0.45, 0.55], [1, 0.85, 0.3], [0.85, 0.5, 1], [1, 0.6, 0.35], [0.4, 0.75, 0.35]][f], wx - 0.4 + f * 0.2, 1.78, z + sd * 0.22, 0, 0);
  }
}
